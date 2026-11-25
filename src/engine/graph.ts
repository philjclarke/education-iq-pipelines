import type { Condition, ID, OutputField, PipelineVersion, RouteAction, Step } from '../domain/types'
import { assemblePrompt } from './prompt'
import { parseJson } from './schema'

export interface Edge {
  from: ID
  to: ID
  kind: 'continue' | 'retry'
  label: string
  ruleId: ID | 'default'
}

function actions(step: Step): { action: RouteAction; label: string; ruleId: ID | 'default' }[] {
  return [
    ...step.rules.map((r) => ({ action: r.action, label: r.label, ruleId: r.id })),
    { action: step.defaultRoute, label: 'Default', ruleId: 'default' as const },
  ]
}

export function edges(version: PipelineVersion): Edge[] {
  const out: Edge[] = []
  for (const s of version.steps) {
    for (const { action, label, ruleId } of actions(s)) {
      if (action.type === 'continue' && action.targetStepId) out.push({ from: s.id, to: action.targetStepId, kind: 'continue', label, ruleId })
      if (action.type === 'retry_from' && action.targetStepId) out.push({ from: s.id, to: action.targetStepId, kind: 'retry', label, ruleId })
    }
  }
  return out
}

/** Steps reachable by forward (continue) routes from `start`, including `start`. */
export function forwardReachable(version: PipelineVersion, start: ID): Set<ID> {
  const fwd = edges(version).filter((e) => e.kind === 'continue')
  const seen = new Set<ID>([start])
  const stack = [start]
  while (stack.length) {
    const cur = stack.pop() as ID
    for (const e of fwd) if (e.from === cur && !seen.has(e.to)) {
      seen.add(e.to)
      stack.push(e.to)
    }
  }
  return seen
}

/** For each step, the steps guaranteed to have run before it on every forward path from the entry. */
export function dominators(version: PipelineVersion): Map<ID, Set<ID>> {
  const entry = version.entryStepId
  const result = new Map<ID, Set<ID>>()
  if (!entry) return result
  const reachable = forwardReachable(version, entry)
  const ids = version.steps.map((s) => s.id).filter((id) => reachable.has(id))
  const fwd = edges(version).filter((e) => e.kind === 'continue')
  const all = new Set(ids)
  for (const id of ids) result.set(id, id === entry ? new Set([entry]) : new Set(all))
  let changed = true
  while (changed) {
    changed = false
    for (const id of ids) {
      if (id === entry) continue
      const preds = fwd.filter((e) => e.to === id && reachable.has(e.from)).map((e) => e.from)
      const predDoms = preds.map((p) => result.get(p) as Set<ID>)
      const inter: ID[] = predDoms.length ? [...predDoms[0]].filter((x) => predDoms.every((d) => d.has(x))) : []
      const next = new Set<ID>(inter)
      next.add(id)
      const prev = result.get(id) as Set<ID>
      if (next.size !== prev.size || [...next].some((x) => !prev.has(x))) {
        result.set(id, next)
        changed = true
      }
    }
  }
  return result
}

/** Steps that can run before `stepId` on at least one forward path. */
export function ancestors(version: PipelineVersion, stepId: ID): Set<ID> {
  const out = new Set<ID>()
  for (const s of version.steps) if (s.id !== stepId && forwardReachable(version, s.id).has(stepId)) out.add(s.id)
  return out
}

export interface ConfigIssue {
  severity: 'error' | 'warning'
  area: 'version' | 'inputs' | 'prompt' | 'bindings' | 'schema' | 'routing' | 'checks' | 'destination'
  stepId?: ID
  ruleId?: ID
  message: string
  /** True when the issue must be fixed before a test can run. */
  blocksTest: boolean
}

function walkConditions(c: Condition, fn: (c: Condition) => void) {
  fn(c)
  if (c.kind === 'group') c.items.forEach((i) => walkConditions(i, fn))
}

export function stepLabel(version: PipelineVersion, id: ID | null): string {
  const s = version.steps.find((x) => x.id === id)
  return s ? s.name : 'unknown step'
}

/** Validate a draft before testing or publication. */
export function validateVersion(version: PipelineVersion): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const byId = new Map(version.steps.map((s) => [s.id, s]))
  const push = (i: ConfigIssue) => issues.push(i)

  if (!version.steps.length) push({ severity: 'error', area: 'version', message: 'Add at least one step.', blocksTest: true })
  if (!version.entryStepId || !byId.has(version.entryStepId))
    push({ severity: 'error', area: 'version', message: 'Choose an entry step.', blocksTest: true })
  if (!version.resultStepId || !byId.has(version.resultStepId))
    push({ severity: 'error', area: 'version', message: 'Choose which step produces the final result.', blocksTest: true })
  if (version.maxRequestAttempts < 1)
    push({ severity: 'error', area: 'version', message: 'Maximum request attempts must be at least 1.', blocksTest: true })

  const aliases = new Set<string>()
  for (const i of version.inputs) {
    if (!/^[a-z][a-z0-9_]*$/.test(i.alias)) push({ severity: 'error', area: 'inputs', message: `Input alias "${i.alias}" must be lower_snake_case.`, blocksTest: true })
    if (aliases.has(i.alias)) push({ severity: 'error', area: 'inputs', message: `Input alias "${i.alias}" is used more than once.`, blocksTest: true })
    aliases.add(i.alias)
    if (i.kind === 'fixed' && !i.fixedValue?.trim()) push({ severity: 'error', area: 'inputs', message: `Fixed input "${i.alias}" has no value.`, blocksTest: true })
    if (i.kind === 'dynamic' && !i.typeRef) push({ severity: 'error', area: 'inputs', message: `Dynamic input "${i.alias}" needs an Inputs type reference.`, blocksTest: true })
  }

  const codes = new Set<string>()
  const doms = dominators(version)
  const reachableFromEntry = version.entryStepId ? forwardReachable(version, version.entryStepId) : new Set<ID>()

  for (const step of version.steps) {
    const at = { stepId: step.id }
    if (codes.has(step.code)) push({ ...at, severity: 'error', area: 'version', message: `Step code "${step.code}" is not unique.`, blocksTest: true })
    codes.add(step.code)
    if (version.entryStepId && !reachableFromEntry.has(step.id))
      push({ ...at, severity: 'warning', area: 'routing', message: `${step.name} cannot be reached from the entry step by any forward route.`, blocksTest: false })

    // Required guided answers
    if (step.type !== 'check' && !step.modelConfigId)
      push({ ...at, severity: 'error', area: 'prompt', message: `${step.name}: choose a model.`, blocksTest: true })
    if (step.type === 'generate') {
      if (!step.prompt.produce.trim()) push({ ...at, severity: 'error', area: 'prompt', message: `${step.name}: answer “What should the model produce?”`, blocksTest: true })
      if (!step.bindings.some((b) => b.role === 'material'))
        push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: bind at least one input under “What material should the model use?”`, blocksTest: true })
      if (!step.prompt.audience.trim()) push({ ...at, severity: 'warning', area: 'prompt', message: `${step.name}: “Who will use it, and what for?” is recommended.`, blocksTest: false })
    }
    if (step.type === 'validate') {
      if (!step.bindings.some((b) => b.role === 'candidate'))
        push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: choose the result being checked.`, blocksTest: true })
      if (!step.bindings.some((b) => b.role === 'evidence'))
        push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: choose what the checker compares against.`, blocksTest: true })
      if (!step.prompt.criteria.length) push({ ...at, severity: 'error', area: 'prompt', message: `${step.name}: add at least one criterion.`, blocksTest: true })
      if (!step.prompt.verdicts.length) push({ ...at, severity: 'error', area: 'prompt', message: `${step.name}: define the allowed verdicts.`, blocksTest: true })
      const vf = step.outputSchema.find((f) => f.name === 'verdict')
      const vals = step.prompt.verdicts.map((v) => v.value)
      if (vf && (vf.allowedValues ?? []).join('|') !== vals.join('|'))
        push({ ...at, severity: 'error', area: 'schema', message: `${step.name}: the verdict field’s allowed values don’t match the verdicts in question 5.`, blocksTest: true })
    }
    if (step.type === 'check') {
      if (!step.checks.length) push({ ...at, severity: 'error', area: 'checks', message: `${step.name}: add a rule to check.`, blocksTest: true })
      for (const c of step.checks)
        if (!step.bindings.some((b) => b.name === c.bindingName))
          push({ ...at, severity: 'error', area: 'checks', message: `${step.name}: check reads “${c.bindingName}”, which is not bound.`, blocksTest: true })
    }
    if (step.type !== 'check' && !step.outputSchema.length)
      push({ ...at, severity: 'error', area: 'schema', message: `${step.name}: define at least one output field.`, blocksTest: true })

    // Bindings
    const ancestorSet = ancestors(version, step.id)
    const dom = doms.get(step.id)
    for (const b of step.bindings) {
      if (!/^[a-z][a-z0-9_]*$/.test(b.name))
        push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: binding name “${b.name}” must be lower_snake_case.`, blocksTest: true })
      if (b.source.kind === 'input') {
        const src = b.source
        if (!version.inputs.some((i) => i.id === src.inputId))
          push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: binding “${b.name}” refers to an input that no longer exists.`, blocksTest: true })
      } else {
        const src = b.source
        const from = byId.get(src.stepId)
        if (!from) {
          push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: binding “${b.name}” refers to a step that no longer exists.`, blocksTest: true })
          continue
        }
        if (!fieldsOf(from).some((f) => f.name === src.field))
          push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: binding “${b.name}” uses ${from.name} → ${src.field}, which is not in that step’s output.`, blocksTest: true })
        if (from.id === step.id || !ancestorSet.has(from.id))
          push({ ...at, severity: 'error', area: 'bindings', message: `${step.name}: “${b.name}” comes from ${from.name}, which never runs before this step.`, blocksTest: true })
        else if (dom && !dom.has(from.id))
          push({ ...at, severity: 'warning', area: 'bindings', message: `${step.name}: “${b.name}” comes from ${from.name}, which may not run on every route into this step.`, blocksTest: false })
      }
    }

    // Prompt variables
    if (step.type !== 'check') {
      const assembled = assemblePrompt(step, version)
      for (const name of assembled.unresolved)
        push({ ...at, severity: 'error', area: 'prompt', message: `${step.name}: the prompt uses {{${name}}}, which is not a binding or fixed input.`, blocksTest: true })
    }

    // Examples kept in sync with schema
    for (const ex of step.prompt.examples) {
      const parsed = parseJson(ex.response)
      if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) continue
      for (const key of Object.keys(parsed.value as object))
        if (!step.outputSchema.some((f) => f.name === key))
          push({ ...at, severity: 'error', area: 'schema', message: `${step.name}: example “${ex.label}” uses field “${key}”, which is not in the output schema.`, blocksTest: true })
      for (const f of step.outputSchema)
        if (f.type === 'enum') {
          const v = (parsed.value as Record<string, unknown>)[f.name]
          if (typeof v === 'string' && !(f.allowedValues ?? []).includes(v))
            push({ ...at, severity: 'error', area: 'schema', message: `${step.name}: example “${ex.label}” sets ${f.name} to “${v}”, which is no longer allowed.`, blocksTest: true })
        }
    }

    // Routing
    const fields = fieldsOf(step)
    const allActions = [...step.rules.map((r) => ({ action: r.action, ruleId: r.id, label: r.label })), { action: step.defaultRoute, ruleId: undefined, label: 'Default route' }]
    for (const { action, ruleId, label } of allActions) {
      const where = { ...at, ruleId }
      if (action.type === 'continue') {
        if (!action.targetStepId || !byId.has(action.targetStepId))
          push({ ...where, severity: 'error', area: 'routing', message: `${step.name} · ${label}: choose a valid step to continue to.`, blocksTest: true })
        else if (action.targetStepId === step.id)
          push({ ...where, severity: 'error', area: 'routing', message: `${step.name} · ${label}: a step cannot continue to itself. Use Retry from step for a bounded loop.`, blocksTest: true })
      }
      if (action.type === 'retry_from') {
        if (!action.targetStepId || !byId.has(action.targetStepId))
          push({ ...where, severity: 'error', area: 'routing', message: `${step.name} · ${label}: a retry needs a restart point.`, blocksTest: true })
        else if (action.targetStepId !== step.id && !ancestorSet.has(action.targetStepId))
          push({ ...where, severity: 'error', area: 'routing', message: `${step.name} · ${label}: retry must restart from this step or an earlier one.`, blocksTest: true })
      }
    }
    for (const rule of step.rules) {
      walkConditions(rule.when, (c) => {
        if (c.kind !== 'field') return
        const f = fields.find((x) => x.name === c.field)
        if (!f) {
          push({ ...at, ruleId: rule.id, severity: 'error', area: 'routing', message: `${step.name} · “${rule.label}”: field “${c.field}” is not in this step’s output.`, blocksTest: true })
          return
        }
        if (f.type === 'enum' && typeof c.value === 'string' && !['is_empty', 'not_empty'].includes(c.cmp) && !(f.allowedValues ?? []).includes(c.value))
          push({ ...at, ruleId: rule.id, severity: 'error', area: 'routing', message: `${step.name} · “${rule.label}”: “${c.value}” is not an allowed value of ${f.name}.`, blocksTest: true })
        if (['>', '>=', '<', '<='].includes(c.cmp) && f.type !== 'number')
          push({ ...at, ruleId: rule.id, severity: 'error', area: 'routing', message: `${step.name} · “${rule.label}”: ${c.cmp} needs a number field, but ${f.name} is ${f.type}.`, blocksTest: true })
      })
    }
  }

  // Forward cycles
  const fwd = edges(version).filter((e) => e.kind === 'continue')
  const state = new Map<ID, 0 | 1 | 2>()
  const visit = (id: ID) => {
    state.set(id, 1)
    for (const e of fwd.filter((x) => x.from === id)) {
      const s = state.get(e.to) ?? 0
      if (s === 1)
        push({
          severity: 'error',
          area: 'routing',
          stepId: e.from,
          ruleId: e.ruleId === 'default' ? undefined : e.ruleId,
          message: `${stepLabel(version, e.from)} · ${e.label}: continuing to ${stepLabel(version, e.to)} creates a cycle. Use Retry from step for a bounded return.`,
          blocksTest: true,
        })
      else if (s === 0) visit(e.to)
    }
    state.set(id, 2)
  }
  if (version.entryStepId && byId.has(version.entryStepId)) visit(version.entryStepId)

  // Destination
  const resultStep = version.resultStepId ? byId.get(version.resultStepId) : undefined
  if (version.destination && resultStep) {
    for (const f of version.destination.fields)
      if (f.source.kind === 'result_field') {
        const src = f.source
        if (!resultStep.outputSchema.some((x) => x.name === src.field))
          push({ severity: 'error', area: 'destination', message: `Destination field ${f.target} maps from “${src.field}”, which is not in ${resultStep.name}’s output.`, blocksTest: false })
      }
    const ef = version.destination.evidenceField
    if (ef && !resultStep.outputSchema.some((x) => x.name === ef))
      push({ severity: 'error', area: 'destination', message: `Evidence rows map from “${ef}”, which is not in ${resultStep.name}’s output.`, blocksTest: false })
  }
  return issues
}

/** Output fields a step exposes (check steps have a fixed shape). */
export function fieldsOf(step: Step): OutputField[] {
  if (step.type === 'check') return CHECK_FIELDS
  return step.outputSchema
}

export const CHECK_FIELDS: OutputField[] = [
  { id: 'chk-passed', name: 'passed', type: 'boolean', required: true, description: 'True when every rule passed' },
  { id: 'chk-wc', name: 'word_count', type: 'number', required: false, description: 'Word count, for word-count rules' },
  { id: 'chk-inv', name: 'invalid_refs', type: 'string_list', required: false, description: 'References not found in the snapshot' },
  { id: 'chk-fail', name: 'failures', type: 'string_list', required: true, description: 'Description of each failed rule' },
]
