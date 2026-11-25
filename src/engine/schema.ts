import type { OutputField } from '../domain/types'
import { isEmptyValue } from './util'

/** Validate a structured output against the step's output schema. */
export function validateAgainstSchema(fields: OutputField[], value: unknown, path = ''): string[] {
  const errors: string[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${path || 'Output'} must be a JSON object`]
  }
  const obj = value as Record<string, unknown>
  const outcome = typeof obj.outcome === 'string' ? obj.outcome : undefined
  for (const f of fields) {
    const v = obj[f.name]
    const label = path ? `${path}.${f.name}` : f.name
    const requiredNow =
      f.required && (!f.requiredForOutcomes?.length || (outcome !== undefined && f.requiredForOutcomes.includes(outcome)))
    if (isEmptyValue(v)) {
      if (requiredNow) errors.push(`${label} is required${f.requiredForOutcomes?.length ? ` when outcome is ${f.requiredForOutcomes.join(' or ')}` : ''}`)
      continue
    }
    switch (f.type) {
      case 'string':
        if (typeof v !== 'string') errors.push(`${label} must be text`)
        break
      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${label} must be a number`)
        else {
          if (f.min !== undefined && v < f.min) errors.push(`${label} must be ≥ ${f.min}`)
          if (f.max !== undefined && v > f.max) errors.push(`${label} must be ≤ ${f.max}`)
        }
        break
      case 'boolean':
        if (typeof v !== 'boolean') errors.push(`${label} must be true or false`)
        break
      case 'enum':
        if (typeof v !== 'string' || !(f.allowedValues ?? []).includes(v))
          errors.push(`${label} must be one of ${(f.allowedValues ?? []).map((a) => `"${a}"`).join(', ')} (got ${JSON.stringify(v)})`)
        break
      case 'string_list':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) errors.push(`${label} must be a list of text values`)
        break
      case 'object_list':
        if (!Array.isArray(v)) errors.push(`${label} must be a list`)
        else
          v.forEach((item, i) => {
            errors.push(...validateAgainstSchema(f.itemFields ?? [], item, `${label}[${i}]`))
          })
        break
    }
  }
  return errors
}

function exampleFor(f: OutputField): unknown {
  if (f.example !== undefined) return f.example
  switch (f.type) {
    case 'string':
      return `<${f.name}>`
    case 'number':
      return f.max !== undefined && f.max <= 1 ? 0.85 : 1
    case 'boolean':
      return true
    case 'enum':
      return f.allowedValues?.[0] ?? ''
    case 'string_list':
      return [`<${f.name} item>`]
    case 'object_list':
      return [exampleFromSchema(f.itemFields ?? [])]
  }
}

export function exampleFromSchema(fields: OutputField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) out[f.name] = exampleFor(f)
  return out
}

function typeLabel(f: OutputField): string {
  switch (f.type) {
    case 'enum':
      return `one of ${(f.allowedValues ?? []).map((v) => `"${v}"`).join(' | ')}`
    case 'string_list':
      return 'list of strings'
    case 'object_list':
      return `list of objects { ${(f.itemFields ?? []).map((i) => `${i.name}: ${typeLabel(i)}`).join('; ')} }`
    case 'number':
      return `number${f.min !== undefined || f.max !== undefined ? ` (${f.min ?? '−∞'}–${f.max ?? '∞'})` : ''}`
    default:
      return f.type
  }
}

/** Human-readable output specification sent alongside the prompt. */
export function schemaToSpec(fields: OutputField[]): string {
  const lines = ['Return a single JSON object with these fields:']
  for (const f of fields) {
    const req = f.required
      ? f.requiredForOutcomes?.length
        ? `required when outcome is ${f.requiredForOutcomes.join(' or ')}`
        : 'required'
      : 'optional'
    lines.push(`- ${f.name} (${typeLabel(f)}, ${req})${f.description ? `: ${f.description}` : ''}`)
  }
  return lines.join('\n')
}

/** Top-level fields that routing rules can reference. */
export function routableFields(fields: OutputField[]): OutputField[] {
  return fields.filter((f) => f.type !== 'object_list')
}

export function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
    return { ok: true, value: JSON.parse(cleaned) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}
