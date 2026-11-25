import { describe, expect, it } from 'vitest'
import type { Db, DbAccess } from '../data/db'
import type { Condition, PipelineVersion, RequestAttempt, StepExecution } from '../domain/types'
import { buildSeed, emptyDb } from '../seed/build'
import { OFSTED_V1 } from '../seed/pipelines'
import { INPUT_RECORDS, MODELS_FOR_TEST } from './testFixtures'
import { validateVersion } from './graph'
import { captureInputs } from './inputs'
import { runAttempt, type RunOutcome, type RunState } from './runner'
import { clone, virtualClock } from './util'

async function simulate(version: PipelineVersion, orgId: string, scenario: string) {
  const clock = virtualClock(Date.parse('2026-11-20T10:00:00Z'))
  const attempts: RequestAttempt[] = []
  const executions: StepExecution[] = []
  let n = 0
  const { snapshots, missing } = captureInputs({ version, orgId, records: INPUT_RECORDS, ownerId: 'T', capturedAt: '2026-11-20T10:00:00Z', newId: (p) => `${p}-${n++}` })
  if (missing.length) return { outcome: { kind: 'missing' as const, missing }, attempts, executions }
  const state: RunState = { ownerId: 'T', version, orgId, scenario, snapshots, attempts: [], executions: [], models: MODELS_FOR_TEST.models, rates: MODELS_FOR_TEST.rates }
  const host = {
    clock,
    simulateLatency: false,
    newId: (p: string) => `${p}-${n++}`,
    onAttempt: (a: RequestAttempt) => {
      const i = attempts.findIndex((x) => x.id === a.id)
      if (i >= 0) attempts[i] = a
      else attempts.push(a)
    },
    onExecution: (e: StepExecution) => {
      const i = executions.findIndex((x) => x.id === e.id)
      if (i >= 0) executions[i] = e
      else executions.push(e)
    },
    onStepChange: () => {},
    audit: () => {},
  }
  let outcome: RunOutcome = await runAttempt(state, host, version.entryStepId as string, 'initial')
  while (outcome.kind === 'retry_scheduled') outcome = await runAttempt(state, host, outcome.fromStepId, 'retry_rule')
  return { outcome, attempts, executions }
}

const path = (execs: StepExecution[]) => execs.map((e) => `${e.stepCode}${e.status === 'reused' ? '(reused)' : ''}`)

describe('seeded Ofsted pipeline', () => {
  it('has no configuration errors', () => {
    expect(validateVersion(OFSTED_V1).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('completes a well-supported case in one attempt', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-millbrook', 'well_supported')
    expect(r.outcome.kind).toBe('complete')
    expect(r.attempts).toHaveLength(1)
    expect(path(r.executions)).toEqual(['select_evidence', 'generate_summary', 'check_summary', 'validate_claims'])
  })

  it('follows the worked example: 0.74 → second review → retry reusing selection', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-harbour', 'worked_example')
    expect(r.outcome.kind).toBe('complete')
    expect(r.attempts).toHaveLength(2)
    const v1 = r.executions.find((e) => e.stepCode === 'validate_claims')
    expect(v1?.structured?.confidence).toBe(0.74)
    expect(path(r.executions)).toEqual([
      'select_evidence', 'generate_summary', 'check_summary', 'validate_claims', 'second_review',
      'select_evidence(reused)', 'generate_summary', 'check_summary', 'validate_claims',
    ])
  })

  it('changing the confidence threshold changes the route for the same seeded response', async () => {
    const v = clone(OFSTED_V1)
    const val = v.steps.find((s) => s.code === 'validate_claims')!
    const group = val.rules[0].when as Extract<Condition, { kind: 'group' }>
    ;(group.items[1] as Extract<Condition, { kind: 'field' }>).value = 0.7
    const r = await simulate(v, 'org-harbour', 'worked_example')
    expect(r.outcome.kind).toBe('complete')
    expect(r.attempts).toHaveLength(1)
    expect(r.executions.some((e) => e.stepCode === 'second_review')).toBe(false)
  })

  it('stops for insufficient evidence', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-oakfield', 'insufficient')
    expect(r.outcome).toMatchObject({ kind: 'failed', reason: 'Insufficient relevant evidence' })
  })

  it('reports missing input before any model call', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-riverside', 'well_supported')
    expect(r.outcome.kind).toBe('missing')
    expect(r.executions).toHaveLength(0)
  })

  it('sends an unsupported claim to manual review, and an evidence rule prevents it', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-fenwick', 'unsupported_claim')
    expect(r.outcome.kind).toBe('manual_review')
    const v = clone(OFSTED_V1)
    v.steps.find((s) => s.code === 'generate_summary')!.prompt.evidenceRules.push('Do not mention awards or accreditations unless an excerpt states them.')
    const fixed = await simulate(v, 'org-fenwick', 'unsupported_claim')
    expect(fixed.outcome.kind).toBe('complete')
  })

  it('retries an over-long draft from generation', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-kingsmead', 'too_long')
    expect(r.outcome.kind).toBe('complete')
    expect(r.attempts).toHaveLength(2)
    expect(r.executions.find((e) => e.stepCode === 'check_summary')?.outcome).toBe('check_failed')
  })

  it('retries a timed-out validator, reusing earlier outputs', async () => {
    const r = await simulate(clone(OFSTED_V1), 'org-ashcombe', 'provider_error')
    expect(r.outcome.kind).toBe('complete')
    expect(path(r.executions).slice(4)).toEqual(['select_evidence(reused)', 'generate_summary(reused)', 'check_summary(reused)', 'validate_claims'])
  })

  it('renaming an allowed verdict is flagged and changes the runtime route', async () => {
    const v = clone(OFSTED_V1)
    const second = v.steps.find((s) => s.code === 'second_review')!
    second.prompt.verdicts[1].value = 'minor_issue'
    const vf = second.outputSchema.find((f) => f.name === 'verdict')!
    vf.allowedValues = ['pass', 'minor_issue', 'material_error']
    const issues = validateVersion(v).filter((i) => i.severity === 'error')
    expect(issues.some((i) => i.message.includes('correctable_issue'))).toBe(true)
    const r = await simulate(v, 'org-harbour', 'worked_example')
    expect(r.outcome).toMatchObject({ kind: 'manual_review', reason: 'Second review was inconclusive' })
  })

  it('applies the request attempt limit', async () => {
    const v = clone(OFSTED_V1)
    v.maxRequestAttempts = 1
    const r = await simulate(v, 'org-kingsmead', 'too_long')
    expect(r.outcome.kind).toBe('manual_review')
    expect(r.attempts).toHaveLength(1)
  })
})

describe('seed history', () => {
  it('builds a database covering every status', async () => {
    const db: Db = await buildSeed(Date.parse('2026-11-25T12:00:00Z'))
    const statuses = new Set(db.requests.map((r) => r.status))
    for (const s of ['queued', 'retry_scheduled', 'awaiting_review', 'completed', 'failed', 'missing_input']) expect(statuses).toContain(s)
    expect(db.deliveries.some((d) => d.status === 'failed')).toBe(true)
    expect(db.reviews.some((r) => r.decision === 'edited_approved')).toBe(true)
    expect(db.requests.every((r) => r.versionId)).toBe(true)
    const missing = db.requests.filter((r) => r.status === 'missing_input')
    expect(missing.every((r) => db.executions.filter((e) => e.ownerId === r.id).length === 0)).toBe(true)
  })

  it('empty db is consistent', () => {
    const db = emptyDb('2026-11-25T12:00:00Z')
    const access: DbAccess = { get: () => db, mutate: (fn) => fn(db) }
    expect(access.get().versions).toHaveLength(3)
  })
})
