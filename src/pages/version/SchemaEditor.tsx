import { Plus, Trash2 } from 'lucide-react'
import { randomCode } from '../../data/db'
import type { Condition, FieldType, OutputField, PipelineVersion, Step } from '../../domain/types'
import { exampleFromSchema } from '../../engine/schema'
import { Badge, Button, CodeBlock, Collapsible, cx, TextInput, Toggle } from '../../ui/kit'

const TYPES: { id: FieldType; label: string }[] = [
  { id: 'string', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'boolean', label: 'True / false' },
  { id: 'enum', label: 'One of…' },
  { id: 'string_list', label: 'List of text' },
  { id: 'object_list', label: 'List of objects' },
]

function conditionsUse(c: Condition, field: string): boolean {
  if (c.kind === 'field') return c.field === field
  if (c.kind === 'group') return c.items.some((i) => conditionsUse(i, field))
  return false
}

/** Where a field is referenced elsewhere in the version. */
export function fieldUsage(version: PipelineVersion, step: Step, field: string): string[] {
  const uses: string[] = []
  for (const s of version.steps)
    for (const b of s.bindings) if (b.source.kind === 'step_output' && b.source.stepId === step.id && b.source.field === field) uses.push(`${s.name} binding “${b.name}”`)
  for (const r of step.rules) if (conditionsUse(r.when, field)) uses.push(`rule “${r.label}”`)
  if (version.resultStepId === step.id && version.destination) {
    for (const f of version.destination.fields) if (f.source.kind === 'result_field' && f.source.field === field) uses.push(`destination ${f.target}`)
    if (version.destination.evidenceField === field) uses.push('destination evidence rows')
  }
  return uses
}

export function SchemaEditor({
  fields,
  onChange,
  readOnly,
  version,
  step,
  nested,
}: {
  fields: OutputField[]
  onChange: (f: OutputField[]) => void
  readOnly: boolean
  version: PipelineVersion
  step: Step
  nested?: boolean
}) {
  const outcomeField = fields.find((f) => f.name === 'outcome' && f.type === 'enum')
  const update = (id: string, patch: Partial<OutputField>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  return (
    <div>
      <div className="space-y-2">
        {fields.map((f) => {
          const usage = nested ? [] : fieldUsage(version, step, f.name)
          return (
            <div key={f.id} className={cx('rounded-[6px] border border-neutral-200 bg-white p-2.5', nested && 'bg-neutral-50')}>
              <div className="flex flex-wrap items-center gap-2">
                <TextInput disabled={readOnly} value={f.name} onChange={(e) => update(f.id, { name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} className="w-44 shrink-0 font-mono text-xs" />
                <select disabled={readOnly} value={f.type} onChange={(e) => update(f.id, { type: e.target.value as FieldType, allowedValues: e.target.value === 'enum' ? f.allowedValues ?? ['value_a', 'value_b'] : undefined, itemFields: e.target.value === 'object_list' ? f.itemFields ?? [] : undefined })} className="h-8 rounded-[6px] border border-neutral-300 px-2 text-sm">
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Toggle disabled={readOnly} checked={f.required} onChange={(v) => update(f.id, { required: v })} label={<span className="text-xs">Required</span>} />
                {!nested && f.type !== 'object_list' && <Badge color="info">routable</Badge>}
                {!readOnly && (
                  <Button size="sm" variant="ghost" tone="error" className="ml-auto" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(fields.filter((x) => x.id !== f.id))} title="Remove field" />
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <TextInput disabled={readOnly} value={f.description} onChange={(e) => update(f.id, { description: e.target.value })} placeholder="What this field means" />
                {f.type === 'enum' && (
                  <TextInput
                    disabled={readOnly}
                    value={(f.allowedValues ?? []).join(', ')}
                    onChange={(e) => update(f.id, { allowedValues: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                    placeholder="Allowed values, comma-separated"
                    className="font-mono text-xs"
                  />
                )}
                {f.type === 'number' && (
                  <div className="flex gap-2">
                    <TextInput disabled={readOnly} type="number" placeholder="min" value={f.min ?? ''} onChange={(e) => update(f.id, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    <TextInput disabled={readOnly} type="number" placeholder="max" value={f.max ?? ''} onChange={(e) => update(f.id, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </div>
                )}
                {outcomeField && f.id !== outcomeField.id && f.required && (
                  <div className="col-span-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    Required for outcome:
                    {(outcomeField.allowedValues ?? []).map((o) => {
                      const on = !f.requiredForOutcomes?.length || f.requiredForOutcomes.includes(o)
                      return (
                        <button
                          type="button"
                          key={o}
                          disabled={readOnly}
                          onClick={() => {
                            const all = outcomeField.allowedValues ?? []
                            const cur = f.requiredForOutcomes?.length ? f.requiredForOutcomes : all
                            const next = on ? cur.filter((x) => x !== o) : [...cur, o]
                            update(f.id, { requiredForOutcomes: next.length === all.length ? undefined : next })
                          }}
                          className={cx('rounded px-1.5 py-0.5 font-mono', on ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'bg-neutral-100 text-neutral-400 line-through')}
                        >
                          {o}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {f.type === 'object_list' && (
                <div className="mt-2 border-l-2 border-neutral-200 pl-3">
                  <div className="mb-1 text-xs font-medium text-neutral-500">Fields of each item</div>
                  <SchemaEditor nested fields={f.itemFields ?? []} onChange={(items) => update(f.id, { itemFields: items })} readOnly={readOnly} version={version} step={step} />
                </div>
              )}
              {usage.length > 0 && <div className="mt-1.5 text-[11px] text-neutral-500">Used by {usage.join(' · ')}</div>}
            </div>
          )
        })}
        {!readOnly && (
          <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...fields, { id: `f-${randomCode(6)}`, name: `field_${fields.length + 1}`, type: 'string', required: false, description: '' }])}>
            Add field
          </Button>
        )}
      </div>
      {!nested && (
        <Collapsible title={<span className="text-xs">Example JSON response, generated from these fields</span>} defaultOpen className="mt-3">
          <CodeBlock maxH="max-h-72">{JSON.stringify(exampleFromSchema(fields), null, 2)}</CodeBlock>
        </Collapsible>
      )}
    </div>
  )
}
