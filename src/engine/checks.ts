import type { CheckResult, ID, InputSnapshot, Step } from '../domain/types'
import { countWords, isEmptyValue } from './util'

/** Read a binding's raw value (not the prompt-formatted string). */
export function rawBindingValue(
  step: Step,
  bindingName: string,
  snapshots: InputSnapshot[],
  outputs: Record<ID, Record<string, unknown>>,
): { found: boolean; value: unknown } {
  const b = step.bindings.find((x) => x.name === bindingName)
  if (!b) return { found: false, value: undefined }
  if (b.source.kind === 'input') {
    const src = b.source
    const snap = snapshots.find((s) => s.inputId === src.inputId)
    if (!snap) return { found: false, value: undefined }
    return { found: true, value: snap.items.filter((i) => i.usable).map((i) => i.content) }
  }
  const src = b.source
  const out = outputs[src.stepId]
  if (!out || !(src.field in out)) return { found: false, value: undefined }
  return { found: true, value: out[src.field] }
}

export function runChecks(
  step: Step,
  snapshots: InputSnapshot[],
  outputs: Record<ID, Record<string, unknown>>,
): { results: CheckResult[]; structured: Record<string, unknown> } {
  const results: CheckResult[] = []
  const structured: Record<string, unknown> = {}
  for (const c of step.checks) {
    const { found, value } = rawBindingValue(step, c.bindingName, snapshots, outputs)
    if (!found) {
      results.push({ name: `${c.kind} on ${c.bindingName}`, passed: false, detail: `Binding "${c.bindingName}" is unavailable` })
      continue
    }
    if (c.kind === 'word_count') {
      const words = countWords(typeof value === 'string' ? value : '')
      structured.word_count = words
      const tooLong = c.maxWords !== undefined && words > c.maxWords
      const tooShort = c.minWords !== undefined && words < c.minWords
      results.push({
        name: `Word count of ${c.bindingName}`,
        passed: !tooLong && !tooShort,
        detail: tooLong
          ? `${words} words, over the limit of ${c.maxWords}`
          : tooShort
            ? `${words} words, under the minimum of ${c.minWords}`
            : `${words} words (limit ${c.minWords ? `${c.minWords}–` : '≤ '}${c.maxWords ?? '∞'})`,
      })
    } else if (c.kind === 'evidence_refs_valid') {
      const refs = Array.isArray(value) ? (value as unknown[]).map(String) : []
      const valid = new Set(
        snapshots
          .filter((s) => (c.evidenceInputIds ?? []).includes(s.inputId))
          .flatMap((s) => s.items.filter((i) => i.usable && i.sourceRowId).map((i) => i.sourceRowId as string)),
      )
      const invalid = refs.filter((r) => !valid.has(r))
      structured.invalid_refs = invalid
      results.push({
        name: `Evidence references in ${c.bindingName}`,
        passed: refs.length > 0 && invalid.length === 0,
        detail:
          refs.length === 0
            ? 'No evidence references returned'
            : invalid.length
              ? `Not in the captured snapshot: ${invalid.join(', ')}`
              : `${refs.length} reference(s), all found in the captured snapshot`,
      })
    } else {
      const ok = !isEmptyValue(value)
      results.push({ name: `${c.bindingName} present`, passed: ok, detail: ok ? 'Value present' : 'Value is empty' })
    }
  }
  structured.passed = results.every((r) => r.passed)
  structured.failures = results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.detail}`)
  return { results, structured }
}
