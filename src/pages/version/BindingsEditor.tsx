import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { randomCode } from '../../data/db'
import type { Binding, BindingRole, BindingSource, PipelineVersion, ResolvedInput, Step } from '../../domain/types'
import { ancestors, dominators, fieldsOf } from '../../engine/graph'
import { Button, cx, TextInput } from '../../ui/kit'
import { useVersion } from './context'

const SEL = 'h-8 rounded-[6px] border border-neutral-300 bg-white px-2 text-sm disabled:bg-neutral-50'

export const ROLE_LABEL: Record<BindingRole, string> = {
  material: 'Material',
  context: 'Context',
  candidate: 'Candidate',
  evidence: 'Evidence',
}

function encode(s: BindingSource): string {
  return s.kind === 'input' ? `input:${s.inputId}` : `out:${s.stepId}:${s.field}`
}
function decode(v: string): BindingSource {
  const [kind, a, b] = v.split(':')
  return kind === 'input' ? { kind: 'input', inputId: a } : { kind: 'step_output', stepId: a, field: b }
}

export function SourceOptions({ version, step, kinds = ['fixed', 'dynamic', 'outputs'] }: { version: PipelineVersion; step: Step; kinds?: ('fixed' | 'dynamic' | 'outputs')[] }) {
  const anc = ancestors(version, step.id)
  const dom = dominators(version).get(step.id)
  const earlier = version.steps.filter((s) => anc.has(s.id)).sort((a, b) => a.displayOrder - b.displayOrder)
  return (
    <>
      {kinds.includes('fixed') && (
        <optgroup label="Fixed inputs">
          {version.inputs
            .filter((i) => i.kind === 'fixed')
            .map((i) => (
              <option key={i.id} value={`input:${i.id}`}>
                {i.alias}
              </option>
            ))}
        </optgroup>
      )}
      {kinds.includes('dynamic') && (
        <optgroup label="Captured source inputs">
          {version.inputs
            .filter((i) => i.kind === 'dynamic')
            .map((i) => (
              <option key={i.id} value={`input:${i.id}`}>
                {i.alias} ({i.typeRef})
              </option>
            ))}
        </optgroup>
      )}
      {kinds.includes('outputs') &&
        earlier.map((s) => (
          <optgroup key={s.id} label={`Output of ${s.name}${dom && !dom.has(s.id) ? ' (may not run on every route)' : ''}`}>
            {fieldsOf(s).map((f) => (
              <option key={f.name} value={`out:${s.id}:${f.name}`}>
                {s.name} → {f.name}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  )
}

export function BindingsEditor({
  step,
  roles,
  defaultRole,
  sample,
  showNote = true,
  onChange,
  emptyText,
  sourceKinds,
}: {
  step: Step
  roles: BindingRole[]
  defaultRole: BindingRole
  sample: ResolvedInput[]
  showNote?: boolean
  onChange: (bindings: Binding[]) => void
  emptyText?: string
  sourceKinds?: ('fixed' | 'dynamic' | 'outputs')[]
}) {
  const { version, readOnly, issues } = useVersion()
  const shown = step.bindings.filter((b) => roles.includes(b.role))
  const update = (id: string, patch: Partial<Binding>) => onChange(step.bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const defaultSource = (): BindingSource | null => {
    const firstInput = version.inputs.find((i) => (sourceKinds ?? ['fixed', 'dynamic']).includes(i.kind))
    if (firstInput && !(sourceKinds && !sourceKinds.includes(firstInput.kind))) return { kind: 'input', inputId: firstInput.id }
    const anc = [...ancestors(version, step.id)]
    const s = version.steps.find((x) => anc.includes(x.id))
    const f = s ? fieldsOf(s)[0] : undefined
    return s && f ? { kind: 'step_output', stepId: s.id, field: f.name } : firstInput ? { kind: 'input', inputId: firstInput.id } : null
  }

  return (
    <div className="space-y-2">
      {shown.length === 0 && <div className="rounded-[6px] border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500">{emptyText ?? 'Nothing bound yet.'}</div>}
      {shown.map((b) => {
        const s = sample.find((x) => x.name === b.name)
        const problems = issues.filter((i) => i.stepId === step.id && i.area === 'bindings' && i.message.includes(`“${b.name}”`))
        const input = b.source.kind === 'input' ? version.inputs.find((i) => i.id === (b.source as { inputId: string }).inputId) : undefined
        return (
          <div key={b.id} className={cx('rounded-[6px] border bg-white p-2.5', problems.some((p) => p.severity === 'error') ? 'border-error-300' : problems.length ? 'border-warning-300' : 'border-neutral-200')}>
            <div className="flex flex-wrap items-center gap-1.5">
              <TextInput disabled={readOnly} value={b.name} onChange={(e) => update(b.id, { name: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} className="w-44 font-mono text-xs" title="Name used in the prompt" />
              <span className="text-xs text-neutral-400">←</span>
              <select disabled={readOnly} className={cx(SEL, 'min-w-0 flex-1')} value={encode(b.source)} onChange={(e) => update(b.id, { source: decode(e.target.value) })}>
                <SourceOptions version={version} step={step} kinds={sourceKinds} />
                {!version.inputs.some((i) => `input:${i.id}` === encode(b.source)) && b.source.kind === 'input' && <option value={encode(b.source)}>(deleted input)</option>}
                {b.source.kind === 'step_output' && <option value={encode(b.source)} hidden>{`${version.steps.find((x) => x.id === (b.source as { stepId: string }).stepId)?.name ?? 'missing step'} → ${(b.source as { field: string }).field}`}</option>}
              </select>
              {roles.length > 1 && (
                <select disabled={readOnly} className={SEL} value={b.role} onChange={(e) => update(b.id, { role: e.target.value as BindingRole })}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
              {!readOnly && (
                <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(step.bindings.filter((x) => x.id !== b.id))} title="Remove binding" />
              )}
            </div>
            {showNote && (
              <TextInput
                disabled={readOnly}
                className="mt-1.5"
                value={b.note}
                onChange={(e) => update(b.id, { note: e.target.value })}
                placeholder={input?.guidance ? `Usage note, e.g. “${input.guidance}”` : 'What does this represent, and how should the model use it?'}
              />
            )}
            <div className="mt-1.5 rounded bg-neutral-50 px-2 py-1 text-[11px] text-neutral-500">
              <span className="font-medium text-neutral-600">Sample:</span> {s ? <span className="font-mono">{s.value.slice(0, 220)}{s.value.length > 220 ? '…' : ''}</span> : <em>not available for the selected sample</em>}
            </div>
            {problems.map((p, i) => (
              <div key={i} className={cx('mt-1 flex items-center gap-1 text-xs', p.severity === 'error' ? 'text-error-700' : 'text-warning-800')}>
                <AlertTriangle className="size-3" /> {p.message.replace(`${step.name}: `, '')}
              </div>
            ))}
          </div>
        )
      })}
      {!readOnly && (
        <Button
          size="sm"
          variant="soft"
          tone="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            const src = defaultSource()
            if (!src) return
            const base = src.kind === 'input' ? version.inputs.find((i) => i.id === src.inputId)?.alias ?? 'value' : src.field
            let name = base
            let n = 2
            while (step.bindings.some((x) => x.name === name)) name = `${base}_${n++}`
            onChange([...step.bindings, { id: `b-${randomCode(6)}`, name, source: src, role: defaultRole, note: '' }])
          }}
        >
          Bind {ROLE_LABEL[defaultRole].toLowerCase()}
        </Button>
      )}
    </div>
  )
}
