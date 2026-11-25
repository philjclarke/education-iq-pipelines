/**
 * Test runs: pin a copy of the draft, run it through the same engine as
 * production, and keep all records in separate test collections.
 */
import type { DbAccess } from '../data/db'
import { nextId, randomCode } from '../data/db'
import type { Assertion, AssertionResult, ID, StepExecution, TestCase, TestRun } from '../domain/types'
import { captureInputs } from '../engine/inputs'
import { compare } from '../engine/routing'
import { runAttempt, type RunOutcome, type RunState } from '../engine/runner'
import { clone, realClock, toIso } from '../engine/util'
import { makeHost } from './requests'

export interface TestRunArgs {
  versionId: ID
  testCaseId?: ID
  orgId: ID | null
  manualInputs: Record<string, string>
  scenario: string
  label: string
  actorId: ID
  suiteRunId?: ID
}

export function describeAssertion(a: Assertion): string {
  switch (a.kind) {
    case 'route':
      return `Route ends in ${a.expected.replace('_', ' ')}`
    case 'outcome':
      return `${a.stepCode} outcome is ${a.expected}`
    case 'field':
      return `${a.stepCode}.${a.field} ${a.cmp} ${JSON.stringify(a.value)}`
    case 'attempts':
      return `Request attempts ${a.cmp} ${a.value}`
  }
}

const ROUTE_FOR_STATUS: Record<TestRun['status'], string> = {
  completed: 'complete',
  awaiting_review: 'manual_review',
  failed: 'fail',
  missing_input: 'missing_input',
  running: 'running',
  interrupted: 'interrupted',
}

export function evaluateAssertions(assertions: Assertion[], run: TestRun, executions: StepExecution[], attemptCount: number): AssertionResult[] {
  const latest = (code: string) => [...executions].reverse().find((e) => e.stepCode === code && e.status !== 'running')
  return assertions.map((a) => {
    const label = describeAssertion(a)
    if (a.kind === 'route') {
      const actual = ROUTE_FOR_STATUS[run.status]
      return { assertionId: a.id, label, passed: actual === a.expected, expected: a.expected, actual }
    }
    if (a.kind === 'attempts') {
      return { assertionId: a.id, label, passed: compare(attemptCount, a.cmp, a.value), expected: `${a.cmp} ${a.value}`, actual: String(attemptCount) }
    }
    const e = latest(a.stepCode)
    if (!e) return { assertionId: a.id, label, passed: false, expected: a.kind === 'outcome' ? a.expected : `${a.cmp} ${JSON.stringify(a.value)}`, actual: 'step did not run' }
    if (a.kind === 'outcome') return { assertionId: a.id, label, passed: e.outcome === a.expected, expected: a.expected, actual: e.outcome ?? 'none' }
    const actual = e.structured?.[a.field]
    return { assertionId: a.id, label, passed: compare(actual, a.cmp, a.value), expected: `${a.cmp} ${JSON.stringify(a.value)}`, actual: actual === undefined ? 'missing' : JSON.stringify(actual) }
  })
}

/** Create the run record (pinning the draft) and start it. Returns the run ID immediately. */
export function startTestRun(access: DbAccess, args: TestRunArgs): { runId: ID; done: Promise<void> } {
  const db = access.get()
  const version = db.versions.find((v) => v.id === args.versionId)
  if (!version) throw new Error('Version not found')
  const pinned = clone(version)
  let runId = ''
  const startedAt = toIso(Date.now())
  access.mutate((d) => {
    runId = nextId(d, 'TR')
    d.testRuns.push({
      id: runId,
      pipelineId: version.pipelineId,
      versionId: version.id,
      versionNumber: version.number,
      pinnedConfig: pinned,
      testCaseId: args.testCaseId ?? null,
      suiteRunId: args.suiteRunId ?? null,
      label: args.label,
      orgId: args.orgId,
      scenario: args.scenario,
      startedAt,
      status: 'running',
      assertionResults: [],
      simulatedCostGBP: 0,
      startedBy: args.actorId,
    })
  })
  const done = execute(access, runId, args)
  return { runId, done }
}

async function execute(access: DbAccess, runId: ID, args: TestRunArgs) {
  const clock = realClock
  const run = access.get().testRuns.find((r) => r.id === runId) as TestRun
  const version = run.pinnedConfig
  const db = access.get()
  await clock.sleep(350)
  const { snapshots, missing } = captureInputs({
    version,
    orgId: args.orgId,
    records: db.inputRecords,
    manualInputs: args.manualInputs,
    ownerId: runId,
    capturedAt: toIso(clock.now()),
    newId: (p) => `${p}-${randomCode(8)}`,
  })
  access.mutate((d) => d.testSnapshots.push(...snapshots))
  if (missing.length) {
    finish(access, runId, 'missing_input', `Missing required input: ${missing.map((m) => m.typeRef ?? m.alias).join(', ')}`, args)
    return
  }
  await clock.sleep(250)
  const state: RunState = {
    ownerId: runId,
    version,
    orgId: args.orgId,
    scenario: args.scenario,
    snapshots,
    attempts: [],
    executions: [],
    models: db.models,
    rates: db.rates,
  }
  const host = makeHost(access, runId, clock, true, 'test')
  let outcome: RunOutcome = await runAttempt(state, host, version.entryStepId as ID, 'initial')
  // In tests, scheduled retry delays are skipped but still counted against limits.
  while (outcome.kind === 'retry_scheduled') {
    const delayed = outcome
    await clock.sleep(400)
    outcome = await runAttempt(state, host, delayed.fromStepId, 'retry_rule', `${delayed.reason} (delay of ${delayed.delaySec}s skipped in test)`)
  }
  if (outcome.kind === 'complete') finish(access, runId, 'completed', undefined, args)
  else if (outcome.kind === 'manual_review') finish(access, runId, 'awaiting_review', outcome.reason, args)
  else finish(access, runId, 'failed', outcome.reason, args)
}

function finish(access: DbAccess, runId: ID, status: TestRun['status'], reason: string | undefined, args: TestRunArgs) {
  access.mutate((d) => {
    const run = d.testRuns.find((r) => r.id === runId)
    if (!run) return
    run.status = status
    run.finalReason = reason
    run.finishedAt = toIso(Date.now())
    const execs = d.testExecutions.filter((e) => e.ownerId === runId)
    run.simulatedCostGBP = execs.reduce((n, e) => n + (e.status === 'reused' ? 0 : e.costGBP ?? 0), 0)
    const tc = args.testCaseId ? d.testCases.find((t) => t.id === args.testCaseId) : undefined
    if (tc) run.assertionResults = evaluateAssertions(tc.assertions, run, execs, d.testAttempts.filter((a) => a.ownerId === runId).length)
  })
}

export function runSuite(access: DbAccess, versionId: ID, cases: TestCase[], actorId: ID): { suiteRunId: ID; runIds: ID[]; done: Promise<void> } {
  const suiteRunId = `SUITE-${randomCode(6)}`
  const runIds: ID[] = []
  const promises: Promise<void>[] = []
  cases.forEach((tc) => {
    const { runId, done } = startTestRun(access, {
      versionId,
      testCaseId: tc.id,
      orgId: tc.orgId,
      manualInputs: tc.manualInputs,
      scenario: tc.scenario,
      label: tc.name,
      actorId,
      suiteRunId,
    })
    runIds.push(runId)
    promises.push(done)
  })
  return { suiteRunId, runIds, done: Promise.all(promises).then(() => undefined) }
}

export function markInterruptedTestRuns(access: DbAccess) {
  access.mutate((d) => {
    for (const r of d.testRuns)
      if (r.status === 'running') {
        r.status = 'interrupted'
        r.finalReason = 'The page was closed or refreshed while this test was running.'
      }
    for (const e of d.testExecutions) if (e.status === 'running') e.status = 'failed'
    for (const a of d.testAttempts) if (a.outcome === 'running') a.outcome = 'interrupted'
  })
}
