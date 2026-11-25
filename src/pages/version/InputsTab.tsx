import { Database, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { randomCode } from '../../data/db'
import { useDb } from '../../data/store'
import type { InputDataType, InputDefinition } from '../../domain/types'
import { matchingRecords, recordIssue } from '../../engine/inputs'
import { Badge, Button, Card, cx, EmptyState, Label, Mono, Select, TextArea, TextInput, Toggle } from '../../ui/kit'
import { useVersion } from './context'

const DATA_TYPES: { id: InputDataType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'excerpt_list', label: 'List of excerpts' },
  { id: 'fact_list', label: 'List of facts' },
  { id: 'number', label: 'Number' },
  { id: 'json', label: 'JSON' },
]

export default function InputsTab() {
  const { version, readOnly, edit } = useVersion()
  const inputTypes = useDb((db) => db.inputTypes)

  const add = (kind: 'fixed' | 'dynamic') =>
    edit((v) => {
      const n = v.inputs.length + 1
      v.inputs.push({
        id: `in-${randomCode(6).toLowerCase()}`,
        alias: kind === 'fixed' ? `fixed_input_${n}` : `source_input_${n}`,
        kind,
        dataType: kind === 'fixed' ? 'text' : 'excerpt_list',
        required: kind === 'dynamic',
        description: '',
        guidance: '',
        fixedValue: kind === 'fixed' ? '' : undefined,
        typeRef: kind === 'dynamic' ? inputTypes[0]?.code : undefined,
      })
    })

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[1fr_420px] gap-5 p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Inputs</h2>
            <p className="text-sm text-neutral-500">Fixed inputs hold a value you define. Dynamic inputs are looked up in the Inputs table for each request’s organisation and captured in an immutable snapshot.</p>
          </div>
          {!readOnly && (
            <div className="flex shrink-0 gap-2">
              <Button icon={<Plus className="size-4" />} onClick={() => add('fixed')}>
                Fixed input
              </Button>
              <Button variant="solid" tone="primary" icon={<Plus className="size-4" />} onClick={() => add('dynamic')}>
                Dynamic input
              </Button>
            </div>
          )}
        </div>
        {version.inputs.length === 0 && <EmptyState title="No inputs yet" icon={<Database className="size-6" />}>Add a dynamic input to pull source records for each request, or a fixed input for definitions and guidance.</EmptyState>}
        {version.inputs.map((input) => (
          <InputCard key={input.id} input={input} />
        ))}
      </div>
      <InputPreview />
    </div>
  )
}

function InputCard({ input }: { input: InputDefinition }) {
  const { version, readOnly, edit } = useVersion()
  const inputTypes = useDb((db) => db.inputTypes)
  const usedBy = version.steps.filter((s) => s.bindings.some((b) => b.source.kind === 'input' && b.source.inputId === input.id))
  const set = (fn: (i: InputDefinition) => void) =>
    edit((v) => {
      const i = v.inputs.find((x) => x.id === input.id)
      if (i) fn(i)
    })

  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge color={input.kind === 'fixed' ? 'neutral' : 'info'}>{input.kind === 'fixed' ? 'Fixed' : 'Dynamic'}</Badge>
          <Mono className="text-sm font-medium text-neutral-900">{`{{${input.alias}}}`}</Mono>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {usedBy.length ? <>Used by {usedBy.map((s) => s.name).join(', ')}</> : <span className="text-warning-700">Not bound to any step</span>}
          {!readOnly && (
            <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => edit((v) => void (v.inputs = v.inputs.filter((x) => x.id !== input.id)))} title="Remove input">
              {usedBy.length ? 'Remove (breaks bindings)' : 'Remove'}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label hint="Used in prompts">Alias</Label>
          <TextInput disabled={readOnly} value={input.alias} onChange={(e) => set((i) => void (i.alias = e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase()))} className="font-mono text-xs" />
        </div>
        {input.kind === 'dynamic' ? (
          <div>
            <Label>Inputs type reference</Label>
            <Select disabled={readOnly} value={input.typeRef ?? ''} onChange={(e) => set((i) => void (i.typeRef = e.target.value))}>
              {inputTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} · {t.source}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div />
        )}
        <div>
          <Label>{input.kind === 'dynamic' ? 'Expected type' : 'Type'}</Label>
          <Select disabled={readOnly} value={input.dataType} onChange={(e) => set((i) => void (i.dataType = e.target.value as InputDataType))}>
            {DATA_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-3">
          <Label>Description</Label>
          <TextInput disabled={readOnly} value={input.description} onChange={(e) => set((i) => void (i.description = e.target.value))} placeholder={input.kind === 'fixed' ? 'e.g. Guidance on assessing careers provision' : 'e.g. Inspection excerpts for the request’s organisation'} />
        </div>
        {input.kind === 'fixed' && (
          <div className="col-span-3">
            <Label required>Value</Label>
            <TextArea disabled={readOnly} rows={4} value={input.fixedValue ?? ''} onChange={(e) => set((i) => void (i.fixedValue = e.target.value))} />
          </div>
        )}
        <div className="col-span-3">
          <Label hint="Shown to prompt authors when they bind this input">Usage guidance</Label>
          <TextInput disabled={readOnly} value={input.guidance} onChange={(e) => set((i) => void (i.guidance = e.target.value))} placeholder="How should a step treat this input?" />
        </div>
        {input.kind === 'dynamic' && (
          <div className="col-span-3 flex items-center gap-3 rounded-[6px] bg-neutral-50 px-3 py-2">
            <Toggle disabled={readOnly} checked={input.required} onChange={(v) => set((i) => void (i.required = v))} label={<span className="font-medium">Required</span>} />
            <span className={cx('text-xs', input.required ? 'font-medium text-error-700' : 'text-neutral-500')}>
              {input.required ? 'If this input is missing, the request stops before any AI call.' : 'If this input is missing, the request continues without it.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function InputPreview() {
  const { version } = useVersion()
  const orgs = useDb((db) => db.orgs)
  const records = useDb((db) => db.inputRecords)
  const [orgId, setOrgId] = useState('org-harbour')
  const dynamic = version.inputs.filter((i) => i.kind === 'dynamic')
  const missing = dynamic.filter((i) => i.required && matchingRecords(records, orgId, i.typeRef ?? '').filter((r) => !recordIssue(r)).length === 0)

  return (
    <div className="sticky top-4 self-start">
      <Card title="Preview with a sample organisation" subtitle="Shows every matching row in the Inputs table.">
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <div className={cx('mt-3 rounded-[6px] px-3 py-2 text-sm', missing.length ? 'bg-error-50 text-error-800' : 'bg-success-50 text-success-800')}>
          {missing.length ? (
            <>
              <strong>Would stop as Missing input:</strong> no usable {missing.map((m) => m.typeRef).join(', ')} records. No model would be called.
            </>
          ) : (
            'All required inputs have usable records. A request would proceed to the entry step.'
          )}
        </div>
        <div className="scroll-thin mt-3 max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          {dynamic.map((i) => {
            const rows = matchingRecords(records, orgId, i.typeRef ?? '')
            const unusable = rows.filter((r) => recordIssue(r))
            return (
              <div key={i.id}>
                <div className="flex items-center justify-between">
                  <Mono className="font-medium text-neutral-800">{i.alias}</Mono>
                  <span className="text-xs text-neutral-500">
                    {rows.length} row{rows.length === 1 ? '' : 's'} · {i.typeRef}
                    {unusable.length > 0 && <span className="text-error-600"> · {unusable.length} unusable</span>}
                  </span>
                </div>
                {rows.length === 0 && <div className="mt-1 rounded-[6px] border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500">No matching records{i.required ? ' (required)' : ' (optional)'}</div>}
                <ul className="mt-1.5 space-y-1.5">
                  {rows.map((r) => {
                    const issue = recordIssue(r)
                    return (
                      <li key={r.id} className={cx('rounded-[6px] border px-2.5 py-2 text-xs', issue ? 'border-error-200 bg-error-50/50' : 'border-neutral-200 bg-white')}>
                        <div className="flex items-center gap-2">
                          <Mono className="text-primary-700">{r.id}</Mono>
                          <span className="truncate font-medium text-neutral-700">{r.title}</span>
                          {r.sourceUrl && (
                            <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto text-neutral-400 hover:text-neutral-700" title={r.sourceUrl}>
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        {issue ? <div className="mt-1 text-error-700">Unusable: {issue}</div> : <p className="mt-1 line-clamp-3 text-neutral-600">{r.content}</p>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          {version.inputs
            .filter((i) => i.kind === 'fixed')
            .map((i) => (
              <div key={i.id}>
                <Mono className="font-medium text-neutral-800">{i.alias}</Mono> <span className="text-xs text-neutral-500">· fixed</span>
                <p className="mt-1 line-clamp-3 rounded-[6px] border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-600">{i.fixedValue || <em>blank</em>}</p>
              </div>
            ))}
        </div>
      </Card>
    </div>
  )
}
