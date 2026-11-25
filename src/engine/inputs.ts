import type {
  Binding,
  ID,
  InputRecord,
  InputSnapshot,
  PipelineVersion,
  ResolvedInput,
  SnapshotItem,
  Step,
} from '../domain/types'

export interface MissingInput {
  alias: string
  typeRef?: string
  reason: string
}

/** Stable ordering for captured records: newest first, then source row ID. */
export function orderRecords(records: InputRecord[]): InputRecord[] {
  return [...records].sort((a, b) => {
    const pa = a.publishedAt ?? ''
    const pb = b.publishedAt ?? ''
    if (pa !== pb) return pa < pb ? 1 : -1
    return a.id < b.id ? -1 : 1
  })
}

export function matchingRecords(records: InputRecord[], orgId: ID, typeRef: string): InputRecord[] {
  return orderRecords(records.filter((r) => r.orgId === orgId && r.typeRef === typeRef))
}

export function recordIssue(r: InputRecord): string | undefined {
  if (r.extraction === 'failed') return 'Text extraction failed at load time'
  if (r.extraction === 'empty' || !r.content || !r.content.trim()) return 'No usable text content'
  return undefined
}

function manualItems(text: string, capturedAt: string): SnapshotItem[] {
  return text
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({
      order: i + 1,
      sourceRowId: `MANUAL-${i + 1}`,
      title: `Manual test value ${i + 1}`,
      content: t,
      capturedAt,
      usable: true,
    }))
}

/**
 * Capture every matching Inputs row for the organisation into an immutable snapshot,
 * and report required inputs with no usable value.
 */
export function captureInputs(args: {
  version: PipelineVersion
  orgId: ID | null
  records: InputRecord[]
  manualInputs?: Record<string, string>
  ownerId: ID
  capturedAt: string
  newId: (prefix: string) => string
}): { snapshots: InputSnapshot[]; missing: MissingInput[] } {
  const { version, orgId, records, manualInputs = {}, ownerId, capturedAt, newId } = args
  const snapshots: InputSnapshot[] = []
  const missing: MissingInput[] = []

  for (const def of version.inputs) {
    let items: SnapshotItem[] = []
    const manual = manualInputs[def.alias]
    if (manual && manual.trim()) {
      items = def.kind === 'fixed' ? [{ order: 1, sourceRowId: null, title: 'Manual test value', content: manual, capturedAt, usable: true }] : manualItems(manual, capturedAt)
    } else if (def.kind === 'fixed') {
      const usable = !!def.fixedValue?.trim()
      items = [{ order: 1, sourceRowId: null, title: 'Fixed value', content: def.fixedValue ?? '', capturedAt, usable, issue: usable ? undefined : 'Fixed value is blank' }]
    } else if (orgId && def.typeRef) {
      items = matchingRecords(records, orgId, def.typeRef).map((r, i) => {
        const issue = recordIssue(r)
        return {
          order: i + 1,
          sourceRowId: r.id,
          title: r.title,
          content: r.content,
          sourceUrl: r.sourceUrl,
          capturedAt,
          usable: !issue,
          issue,
        }
      })
    }
    const usableCount = items.filter((i) => i.usable).length
    const status: InputSnapshot['status'] = usableCount === 0 ? 'missing' : usableCount < items.length ? 'partial' : 'captured'
    snapshots.push({
      id: newId('SNP'),
      ownerId,
      inputId: def.id,
      alias: def.alias,
      kind: def.kind,
      typeRef: def.typeRef,
      required: def.required,
      status,
      items,
    })
    if (def.required && usableCount === 0) {
      missing.push({
        alias: def.alias,
        typeRef: def.typeRef,
        reason: items.length === 0 ? `No ${def.typeRef ?? 'value'} records found for this organisation` : `${items.length} record(s) found but none usable`,
      })
    }
  }
  return { snapshots, missing }
}

export function formatSnapshot(s: InputSnapshot, dataType: string): string {
  const usable = s.items.filter((i) => i.usable)
  if (s.kind === 'fixed' && usable.length === 1 && !usable[0].sourceRowId) return usable[0].content ?? ''
  if (usable.length === 0) return '(no usable records)'
  if (dataType === 'fact_list') return usable.map((i) => `[${i.sourceRowId}] ${i.title}: ${i.content}`).join('\n')
  return usable.map((i) => `[${i.sourceRowId}] ${i.title}\n${i.content}`).join('\n\n')
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return JSON.stringify(v)
  return JSON.stringify(v, null, 2)
}

export function bindingSourceLabel(b: Binding, version: PipelineVersion): string {
  if (b.source.kind === 'input') {
    const src = b.source
    const def = version.inputs.find((i) => i.id === src.inputId)
    if (!def) return 'Unknown input'
    return def.kind === 'fixed' ? `Fixed input · ${def.alias}` : `Captured input · ${def.alias} (${def.typeRef})`
  }
  const src = b.source
  const step = version.steps.find((s) => s.id === src.stepId)
  return `${step?.name ?? 'Unknown step'} → ${src.field}`
}

/** Resolve a step's bindings from the snapshot and prior step outputs. */
export function resolveBindings(args: {
  step: Step
  version: PipelineVersion
  snapshots: InputSnapshot[]
  outputs: Record<ID, Record<string, unknown>>
}): { resolved: ResolvedInput[]; unavailable: string[] } {
  const { step, version, snapshots, outputs } = args
  const resolved: ResolvedInput[] = []
  const unavailable: string[] = []
  for (const b of step.bindings) {
    const sourceLabel = bindingSourceLabel(b, version)
    if (b.source.kind === 'input') {
      const src = b.source
      const def = version.inputs.find((i) => i.id === src.inputId)
      const snap = snapshots.find((s) => s.inputId === src.inputId)
      if (!def || !snap) {
        unavailable.push(b.name)
        continue
      }
      resolved.push({
        name: b.name,
        role: b.role,
        sourceLabel,
        value: formatSnapshot(snap, def.dataType),
        sourceRowIds: snap.items.filter((i) => i.usable && i.sourceRowId).map((i) => i.sourceRowId as string),
      })
    } else {
      const src = b.source
      const out = outputs[src.stepId]
      if (!out || !(src.field in out)) {
        unavailable.push(b.name)
        continue
      }
      resolved.push({ name: b.name, role: b.role, sourceLabel, value: formatValue(out[src.field]), sourceRowIds: [] })
    }
  }
  return { resolved, unavailable }
}
