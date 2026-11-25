/**
 * Simulated execution of one pipeline request or test run.
 *
 * The runner is pure orchestration: it reads the pinned version configuration,
 * the immutable input snapshot and earlier executions, and reports every new
 * attempt and step execution through the host as it happens.
 */
import type {
  AttemptTrigger,
  ID,
  InputSnapshot,
  ModelConfig,
  ModelRate,
  PipelineVersion,
  RequestAttempt,
  StandardOutcome,
  Step,
  StepExecution,
} from '../domain/types'
import { runChecks } from './checks'
import { forwardReachable } from './graph'
import { resolveBindings } from './inputs'
import { simulateModelCall } from './mockProvider'
import { assemblePrompt, blocksToText } from './prompt'
import { describeAction, routeStep } from './routing'
import { parseJson, validateAgainstSchema } from './schema'
import { clone, estimateTokens, toIso, type Clock } from './util'

export interface RunHost {
  clock: Clock
  newId(prefix: string): string
  /** Wait for simulated model latency (false when seeding history). */
  simulateLatency: boolean
  onAttempt(a: RequestAttempt): void
  onExecution(e: StepExecution): void
  onStepChange(stepId: ID | null): void
  audit(kind: 'routed' | 'retry_scheduled' | 'status_changed', message: string, stepId?: ID): void
}

export interface RunState {
  ownerId: ID
  version: PipelineVersion
  orgId: ID | null
  scenario: string
  snapshots: InputSnapshot[]
  attempts: RequestAttempt[]
  executions: StepExecution[]
  models: ModelConfig[]
  rates: ModelRate[]
}

export type RunOutcome =
  | { kind: 'complete'; payload: Record<string, unknown>; evidenceRefs: string[]; resultExecutionId: ID }
  | { kind: 'manual_review'; reason: string; sourceExecutionId: ID; sourceStepId: ID; candidate: Record<string, unknown> }
  | { kind: 'failed'; reason: string }
  | { kind: 'retry_scheduled'; fromStepId: ID; delaySec: number; reason: string }

const MAX_STEPS_PER_ATTEMPT = 50

export function rateFor(rates: ModelRate[], modelConfigId: ID, atIso: string): ModelRate | undefined {
  return rates
    .filter((r) => r.modelConfigId === modelConfigId && r.effectiveFrom <= atIso)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
}

/** Latest produced output for each step, following reuse links back to the producer. */
export function latestOutputs(executions: StepExecution[], attemptId?: ID): Record<ID, Record<string, unknown>> {
  const out: Record<ID, Record<string, unknown>> = {}
  for (const e of executions) {
    if (attemptId && e.attemptId !== attemptId) continue
    if ((e.status === 'succeeded' || e.status === 'reused') && e.structured) out[e.stepId] = e.structured
  }
  return out
}

function invocationCount(executions: StepExecution[], stepId: ID): number {
  return executions.filter((e) => e.stepId === stepId && e.status !== 'reused').length
}

export async function runAttempt(
  state: RunState,
  host: RunHost,
  startStepId: ID,
  trigger: AttemptTrigger,
  triggerDetail?: string,
): Promise<RunOutcome> {
  const { version } = state
  const stepsById = new Map(version.steps.map((s) => [s.id, s]))
  const name = (id: ID | null) => stepsById.get(id ?? '')?.name ?? 'unknown step'

  const exhausted = (reason: string): RunOutcome => {
    const resultExec = [...state.executions].reverse().find((e) => e.stepId === version.resultStepId && e.structured)
    if (version.exhaustionAction === 'manual_review' && resultExec?.structured)
      return { kind: 'manual_review', reason: `Limit reached: ${reason}`, sourceExecutionId: resultExec.id, sourceStepId: resultExec.stepId, candidate: resultExec.structured }
    return { kind: 'failed', reason: `Limit reached: ${reason}` }
  }

  if (state.attempts.length >= version.maxRequestAttempts) {
    return exhausted(`all ${version.maxRequestAttempts} request attempts used`)
  }

  const preceding = state.attempts[state.attempts.length - 1]
  const attempt: RequestAttempt = {
    id: host.newId('ATT'),
    ownerId: state.ownerId,
    number: state.attempts.length + 1,
    versionId: version.id,
    startingStepId: startStepId,
    trigger,
    triggerDetail,
    precedingAttemptId: preceding?.id,
    startedAt: toIso(host.clock.now()),
    outcome: 'running',
  }
  state.attempts.push(attempt)
  host.onAttempt(clone(attempt))

  const finishAttempt = (outcome: RequestAttempt['outcome']) => {
    attempt.outcome = outcome
    attempt.finishedAt = toIso(host.clock.now())
    host.onAttempt(clone(attempt))
  }

  // Reuse still-valid outputs produced before the restart point.
  if (preceding) {
    const recomputed = forwardReachable(version, startStepId)
    const prior = latestOutputs(state.executions)
    for (const step of version.steps) {
      if (recomputed.has(step.id) || !prior[step.id]) continue
      const source = [...state.executions].reverse().find((e) => e.stepId === step.id && (e.status === 'succeeded' || e.status === 'reused'))
      if (!source) continue
      const producerId = source.reusedFromExecutionId ?? source.id
      const reused: StepExecution = {
        ...clone(source),
        id: host.newId('EXE'),
        attemptId: attempt.id,
        status: 'reused',
        reusedFromExecutionId: producerId,
        startedAt: toIso(host.clock.now()),
        finishedAt: toIso(host.clock.now()),
        durationMs: 0,
        usage: null,
        costGBP: 0,
        costNote: 'Reused output: no new model call',
        matchedRule: undefined,
        action: undefined,
      }
      state.executions.push(reused)
      host.onExecution(clone(reused))
    }
  }

  let step: Step | undefined = stepsById.get(startStepId)
  let guard = 0
  while (step) {
    if (++guard > MAX_STEPS_PER_ATTEMPT) {
      finishAttempt('failed')
      return { kind: 'failed', reason: 'Step limit per attempt exceeded (possible routing loop)' }
    }
    const invocation = invocationCount(state.executions, step.id) + 1
    if (step.maxInvocations && invocation > step.maxInvocations) {
      finishAttempt(version.exhaustionAction === 'manual_review' ? 'manual_review' : 'failed')
      return exhausted(`${step.name} reached its limit of ${step.maxInvocations} invocation(s)`)
    }
    host.onStepChange(step.id)
    const exec = await executeStep(state, host, attempt, step, invocation)
    // Field conditions only see output that passed schema validation.
    const decision = routeStep(step, exec.outcome as StandardOutcome, exec.status === 'succeeded' ? exec.structured : undefined)
    exec.matchedRule = { ruleId: decision.ruleId, label: decision.label, position: decision.position, explanation: decision.explanation }
    exec.action = decision.action
    host.onExecution(clone(exec))
    host.audit('routed', `${step.name}: ${decision.label} → ${describeAction(decision.action, name)}`, step.id)

    const action = decision.action
    switch (action.type) {
      case 'continue': {
        const next = stepsById.get(action.targetStepId ?? '')
        if (!next) {
          finishAttempt('failed')
          return { kind: 'failed', reason: `${step.name} routed to a step that does not exist` }
        }
        step = next
        break
      }
      case 'complete': {
        const outputs = latestOutputs(state.executions, attempt.id)
        const payload = version.resultStepId ? outputs[version.resultStepId] : undefined
        const resultExec = [...state.executions].reverse().find((e) => e.attemptId === attempt.id && e.stepId === version.resultStepId && e.structured)
        finishAttempt(payload ? 'completed' : 'failed')
        host.onStepChange(null)
        if (!payload || !resultExec) return { kind: 'failed', reason: 'Completed without a result output' }
        const evField = version.destination?.evidenceField ?? 'evidence_refs'
        const refs = Array.isArray(payload[evField]) ? (payload[evField] as unknown[]).map(String) : []
        return { kind: 'complete', payload: clone(payload), evidenceRefs: refs, resultExecutionId: resultExec.reusedFromExecutionId ?? resultExec.id }
      }
      case 'retry_from': {
        finishAttempt('retried')
        const target = action.targetStepId ?? step.id
        const reason = `${step.name}: ${decision.label}`
        if (state.attempts.length >= version.maxRequestAttempts) {
          return exhausted(`all ${version.maxRequestAttempts} request attempts used`)
        }
        if (action.delaySec > 0) {
          host.audit('retry_scheduled', `Retry from ${name(target)} scheduled in ${action.delaySec}s (${reason})`, step.id)
          return { kind: 'retry_scheduled', fromStepId: target, delaySec: action.delaySec, reason }
        }
        return runAttempt(state, host, target, 'retry_rule', reason)
      }
      case 'fail':
        finishAttempt('failed')
        host.onStepChange(null)
        return { kind: 'failed', reason: action.reason || `${step.name}: ${decision.label}` }
      case 'manual_review': {
        finishAttempt('manual_review')
        const outputs = latestOutputs(state.executions, attempt.id)
        const resultId = version.resultStepId ?? step.id
        const candidate = outputs[resultId] ?? exec.structured ?? {}
        const sourceExec = [...state.executions].reverse().find((e) => e.attemptId === attempt.id && e.stepId === resultId) ?? exec
        return { kind: 'manual_review', reason: action.reason || `${step.name}: ${decision.label}`, sourceExecutionId: sourceExec.id, sourceStepId: sourceExec.stepId, candidate: clone(candidate) }
      }
    }
  }
  finishAttempt('failed')
  return { kind: 'failed', reason: 'No step to run' }
}

async function executeStep(state: RunState, host: RunHost, attempt: RequestAttempt, step: Step, invocation: number): Promise<StepExecution> {
  const { version } = state
  const startedMs = host.clock.now()
  const outputs = latestOutputs(state.executions, attempt.id)
  const { resolved, unavailable } = resolveBindings({ step, version, snapshots: state.snapshots, outputs })
  const exec: StepExecution = {
    id: host.newId('EXE'),
    ownerId: state.ownerId,
    attemptId: attempt.id,
    stepId: step.id,
    stepCode: step.code,
    stepName: step.name,
    stepType: step.type,
    invocation,
    status: 'running',
    resolvedInputs: resolved,
    schemaErrors: [],
    checks: [],
    startedAt: toIso(startedMs),
  }
  state.executions.push(exec)
  host.onExecution(clone(exec))

  const finish = (patch: Partial<StepExecution>) => {
    Object.assign(exec, patch)
    const end = host.clock.now()
    exec.finishedAt = toIso(end)
    exec.durationMs = end - startedMs
    host.onExecution(clone(exec))
    return exec
  }

  if (step.type === 'check') {
    if (host.simulateLatency) await host.clock.sleep(250)
    else await host.clock.sleep(40)
    const { results, structured } = runChecks(step, state.snapshots, outputs)
    return finish({ status: 'succeeded', checks: results, structured, outcome: structured.passed ? 'success' : 'check_failed', usage: null, costGBP: 0, costNote: 'Deterministic check: no model call' })
  }

  const model = state.models.find((m) => m.id === step.modelConfigId)
  const assembled = assemblePrompt(step, version, resolved)
  const system = blocksToText(assembled.system)
  const user = blocksToText(assembled.user)
  exec.renderedPrompt = { system, user, outputSpec: assembled.outputSpec }
  if (model) exec.model = { provider: model.provider, modelId: model.modelId, settings: clone(step.settings) }

  if (unavailable.length) {
    return finish({ status: 'failed', outcome: 'invalid_output', error: `Unavailable binding(s): ${unavailable.join(', ')}`, usage: null, costGBP: 0 })
  }
  if (!model) return finish({ status: 'failed', outcome: 'provider_error', error: 'No model configured for this step', usage: null, costGBP: 0 })

  const inputTokens = estimateTokens(system + user)
  const budgetNote = inputTokens > model.inputTokenBudget ? `Input (${inputTokens} tokens) exceeds ${model.displayName}’s budget of ${model.inputTokenBudget}. Production should follow a configured preparation route.` : undefined

  const response = simulateModelCall({
    stepCode: step.code,
    stepType: step.type,
    modelId: model.modelId,
    scenario: state.scenario,
    invocation,
    orgId: state.orgId,
    resolved,
    promptText: system,
    outputSchema: step.outputSchema,
    uncertaintyOutcome: step.prompt.uncertaintyOutcome,
  })
  const wait = response.error?.outcome === 'timeout' ? Math.min(response.latencyMs, model.timeoutSec * 1000) : response.latencyMs
  await host.clock.sleep(host.simulateLatency ? Math.min(wait, 2400) : wait)

  const outputTokens = estimateTokens(response.raw)
  const at = toIso(host.clock.now())
  const rate = rateFor(state.rates, model.id, at)
  const usage = response.error ? { inputTokens, outputTokens: 0 } : { inputTokens, outputTokens }
  const costGBP = rate ? (usage.inputTokens * rate.inputPerMTokGBP + usage.outputTokens * rate.outputPerMTokGBP) / 1_000_000 : null
  const costFields = { usage, costGBP, rateId: rate?.id, costNote: rate ? undefined : 'Pricing unavailable: no rate recorded for this model' }

  if (response.error) {
    return finish({ status: 'failed', outcome: response.error.outcome, error: response.error.message, rawOutput: '', ...costFields })
  }
  const parsed = parseJson(response.raw)
  if (!parsed.ok) {
    return finish({ status: 'failed', outcome: 'invalid_output', rawOutput: response.raw, schemaErrors: [`Response is not valid JSON: ${parsed.error}`], error: budgetNote, ...costFields })
  }
  const errors = validateAgainstSchema(step.outputSchema, parsed.value)
  const structured = parsed.value as Record<string, unknown>
  if (errors.length) {
    return finish({ status: 'failed', outcome: 'invalid_output', rawOutput: response.raw, structured, schemaErrors: errors, error: budgetNote, ...costFields })
  }
  const uncertainty = step.prompt.uncertaintyOutcome.trim() || 'insufficient_evidence'
  const outcome: StandardOutcome = structured.outcome === uncertainty ? 'insufficient_evidence' : 'success'
  return finish({ status: 'succeeded', outcome, rawOutput: response.raw, structured, error: budgetNote, ...costFields })
}
