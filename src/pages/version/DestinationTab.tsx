import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { randomCode } from '../../data/db'
import type { DestinationFieldMap } from '../../domain/types'
import { exampleFromSchema } from '../../engine/schema'
import { Badge, Button, Card, CodeBlock, Select, TextInput } from '../../ui/kit'
import { useVersion } from './context'

const ATHENA_FIELDS = ['Insight.OrgId', 'Insight.PersonId', 'Insight.ThemeId', 'Insight.SentimentId', 'Insight.Statement', 'Insight.SourcePipelineVersion', 'Insight.LensId']

export default function DestinationTab() {
  const { version, readOnly, edit } = useVersion()
  const dest = version.destination
  const resultStep = version.steps.find((s) => s.id === version.resultStepId)
  const fields = resultStep?.outputSchema ?? []
  const set = (fn: (d: NonNullable<typeof dest>) => void) =>
    edit((v) => {
      if (v.destination) fn(v.destination)
    })

  const sample = exampleFromSchema(fields)
  const preview = dest
    ? {
        Insight: Object.fromEntries(
          dest.fields.map((f) => [f.target.replace('Insight.', ''), f.source.kind === 'fixed' ? f.source.value : f.source.kind === 'request' ? `<request.${f.source.field}>` : sample[f.source.field] ?? null]),
        ),
        Evidence: dest.evidenceField ? ['<one row per reference in ' + dest.evidenceField + '>'] : [],
      }
    : null

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_360px] gap-5 p-6">
      <Card
        title="Athena destination mapping"
        subtitle={dest ? `${dest.adapter}. Each integration uses a developer-maintained adapter; this maps result fields to the adapter’s write contract.` : 'No destination configured.'}
      >
        {!dest ? (
          !readOnly && (
            <Button
              onClick={() =>
                edit((v) => {
                  v.destination = { destination: 'athena', adapter: 'AthenaInsightAdapter (simulated)', description: '', fields: [], evidenceField: null }
                })
              }
            >
              Add Athena destination
            </Button>
          )
        ) : (
          <div className="space-y-2">
            <div className="mb-3 rounded-[6px] bg-warning-50 px-3 py-2 text-xs text-warning-800">The real Athena write contract is still to be confirmed. These target fields follow the Insight / Evidence model from the EdIQ data diagram.</div>
            {dest.fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                <Select disabled={readOnly} className="w-56 font-mono text-xs" value={f.target} onChange={(e) => set((d) => void (d.fields[i].target = e.target.value))}>
                  {ATHENA_FIELDS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <ArrowRight className="size-4 rotate-180 text-neutral-400" />
                <Select
                  disabled={readOnly}
                  className="w-44"
                  value={f.source.kind}
                  onChange={(e) =>
                    set((d) => {
                      const k = e.target.value as DestinationFieldMap['source']['kind']
                      d.fields[i].source = k === 'fixed' ? { kind: 'fixed', value: '' } : k === 'request' ? { kind: 'request', field: 'orgId' } : { kind: 'result_field', field: fields[0]?.name ?? '' }
                    })
                  }
                >
                  <option value="result_field">Result field</option>
                  <option value="request">Request value</option>
                  <option value="fixed">Fixed value</option>
                </Select>
                {f.source.kind === 'result_field' && (
                  <Select disabled={readOnly} className="flex-1 font-mono text-xs" value={f.source.field} onChange={(e) => set((d) => void (d.fields[i].source = { kind: 'result_field', field: e.target.value }))}>
                    {!fields.some((x) => x.name === (f.source as { field: string }).field) && <option value={f.source.field}>{f.source.field} (missing)</option>}
                    {fields.map((x) => (
                      <option key={x.id} value={x.name}>
                        {resultStep?.name} → {x.name}
                      </option>
                    ))}
                  </Select>
                )}
                {f.source.kind === 'request' && (
                  <Select disabled={readOnly} className="flex-1" value={f.source.field} onChange={(e) => set((d) => void (d.fields[i].source = { kind: 'request', field: e.target.value as 'orgId' }))}>
                    <option value="orgId">Organisation ID</option>
                    <option value="requestId">Request ID</option>
                    <option value="versionNumber">Version number</option>
                  </Select>
                )}
                {f.source.kind === 'fixed' && <TextInput disabled={readOnly} className="flex-1 font-mono text-xs" value={f.source.value} onChange={(e) => set((d) => void (d.fields[i].source = { kind: 'fixed', value: e.target.value }))} />}
                {!readOnly && <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => set((d) => void d.fields.splice(i, 1))} />}
              </div>
            ))}
            {!readOnly && (
              <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => set((d) => void d.fields.push({ id: `dm-${randomCode(5)}`, target: 'Insight.Statement', source: { kind: 'result_field', field: fields[0]?.name ?? '' } }))}>
                Add field
              </Button>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-3">
              <span className="text-sm font-medium">Evidence rows from</span>
              <Select disabled={readOnly} className="w-64" value={dest.evidenceField ?? ''} onChange={(e) => set((d) => void (d.evidenceField = e.target.value || null))}>
                <option value="">None</option>
                {fields
                  .filter((x) => x.type === 'string_list')
                  .map((x) => (
                    <option key={x.id} value={x.name}>
                      {x.name}
                    </option>
                  ))}
              </Select>
              <Badge>ContentSnippet / Fact</Badge>
            </div>
          </div>
        )}
      </Card>
      <Card title="Payload preview" subtitle="Using example values from the result schema">
        {preview && <CodeBlock>{JSON.stringify(preview, null, 2)}</CodeBlock>}
      </Card>
    </div>
  )
}
