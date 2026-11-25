import type { Condition, RouteAction, Step, StandardOutcome, Comparator } from '../domain/types'
import { isEmptyValue } from './util'

export interface RouteDecision {
  ruleId: string | 'default'
  label: string
  position: number | null
  action: RouteAction
  explanation: string[]
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`
  return JSON.stringify(v)
}

export function compare(actual: unknown, cmp: Comparator, expected: unknown): boolean {
  switch (cmp) {
    case 'is_empty':
      return isEmptyValue(actual)
    case 'not_empty':
      return !isEmptyValue(actual)
    case '=':
      return actual === expected || (typeof actual === 'number' && Number(expected) === actual)
    case '!=':
      return !(actual === expected || (typeof actual === 'number' && Number(expected) === actual))
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const a = Number(actual)
      const b = Number(expected)
      if (typeof actual !== 'number' || Number.isNaN(b)) return false
      if (cmp === '>') return a > b
      if (cmp === '>=') return a >= b
      if (cmp === '<') return a < b
      return a <= b
    }
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as string)
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as string)
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected)
      if (typeof actual === 'string') return actual.toLowerCase().includes(String(expected).toLowerCase())
      return false
  }
}

export function describeCondition(c: Condition): string {
  if (c.kind === 'outcome') return `outcome ${c.cmp} ${c.value}`
  if (c.kind === 'field') {
    if (c.cmp === 'is_empty' || c.cmp === 'not_empty') return `${c.field} ${c.cmp.replace('_', ' ')}`
    return `${c.field} ${c.cmp} ${Array.isArray(c.value) ? `[${c.value.join(', ')}]` : fmt(c.value)}`
  }
  if (c.items.length === 0) return 'always'
  return c.items.map((i) => (i.kind === 'group' ? `(${describeCondition(i)})` : describeCondition(i))).join(` ${c.op} `)
}

export function evaluateCondition(
  c: Condition,
  outcome: StandardOutcome,
  output: Record<string, unknown> | undefined,
  trail: string[],
): boolean {
  if (c.kind === 'outcome') {
    const ok = c.cmp === '=' ? outcome === c.value : outcome !== c.value
    trail.push(`${ok ? '✓' : '✗'} outcome ${c.cmp} ${c.value} (was ${outcome})`)
    return ok
  }
  if (c.kind === 'field') {
    const actual = output?.[c.field]
    const ok = compare(actual, c.cmp, c.value)
    trail.push(`${ok ? '✓' : '✗'} ${describeCondition(c)} (was ${actual === undefined ? 'missing' : fmt(actual)})`)
    return ok
  }
  if (c.items.length === 0) {
    trail.push('✓ no conditions (always matches)')
    return true
  }
  if (c.op === 'AND') {
    for (const item of c.items) if (!evaluateCondition(item, outcome, output, trail)) return false
    return true
  }
  let any = false
  for (const item of c.items) if (evaluateCondition(item, outcome, output, trail)) any = true
  return any
}

/** Evaluate a step's ordered rules; first match wins, otherwise the default route. */
export function routeStep(step: Step, outcome: StandardOutcome, output: Record<string, unknown> | undefined): RouteDecision {
  const explanation: string[] = []
  for (let i = 0; i < step.rules.length; i++) {
    const rule = step.rules[i]
    const trail: string[] = []
    const matched = evaluateCondition(rule.when, outcome, output, trail)
    explanation.push(`Rule ${i + 1} "${rule.label}": ${matched ? 'matched' : 'not matched'}`)
    explanation.push(...trail.map((t) => `   ${t}`))
    if (matched) return { ruleId: rule.id, label: rule.label, position: i + 1, action: rule.action, explanation }
  }
  explanation.push('No rule matched, so the default route was used')
  return { ruleId: 'default', label: 'Default route', position: null, action: step.defaultRoute, explanation }
}

export function describeAction(a: RouteAction, stepName: (id: string | null) => string): string {
  switch (a.type) {
    case 'continue':
      return `Continue to ${stepName(a.targetStepId)}`
    case 'complete':
      return 'Complete'
    case 'retry_from':
      return `Retry from ${stepName(a.targetStepId)}${a.delaySec ? ` after ${a.delaySec}s` : ''}`
    case 'fail':
      return `Fail${a.reason ? `: ${a.reason}` : ''}`
    case 'manual_review':
      return `Send to manual review${a.reason ? `: ${a.reason}` : ''}`
  }
}
