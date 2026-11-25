import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDb } from '../../data/store'
import type { ID, InputSnapshot, PipelineVersion, ResolvedInput, Step } from '../../domain/types'
import { captureInputs, resolveBindings } from '../../engine/inputs'
import { assemblePrompt, type PromptBlock } from '../../engine/prompt'
import { exampleFromSchema } from '../../engine/schema'
import { fieldsOf } from '../../engine/graph'
import { cx, Select, Tabs } from '../../ui/kit'

export interface SampleChoice {
  orgId: ID | null
  manualInputs: Record<string, string>
  label: string
}

/** Resolve a step's bindings against a sample organisation or saved test case. */
export function useSample(version: PipelineVersion, step: Step, choice: SampleChoice) {
  const records = useDb((db) => db.inputRecords)
  const testRuns = useDb((db) => db.testRuns)
  const testExecutions = useDb((db) => db.testExecutions)
  return useMemo(() => {
    const { snapshots } = captureInputs({ version, orgId: choice.orgId, records, manualInputs: choice.manualInputs, ownerId: 'preview', capturedAt: new Date().toISOString(), newId: (p) => `${p}-preview` })
    // Earlier step outputs: from the latest test run of this version for the same sample, else schema examples.
    const run = [...testRuns].reverse().find((r) => r.versionId === version.id && r.orgId === choice.orgId && r.status !== 'running')
    const outputs: Record<ID, Record<string, unknown>> = {}
    let outputsFrom = 'example values generated from each step’s schema'
    for (const s of version.steps) {
      const e = run ? [...testExecutions].reverse().find((x) => x.ownerId === run.id && x.stepId === s.id && x.structured) : undefined
      if (e?.structured) {
        outputs[s.id] = e.structured
        outputsFrom = `test run ${run?.id}`
      } else outputs[s.id] = s.type === 'check' ? { passed: true, failures: [], word_count: 80, invalid_refs: [] } : exampleFromSchema(fieldsOf(s))
    }
    const { resolved } = resolveBindings({ step, version, snapshots, outputs })
    return { resolved, snapshots, outputsFrom }
  }, [version, step, choice, records, testRuns, testExecutions])
}

export function SamplePicker({ value, onChange }: { value: SampleChoice; onChange: (c: SampleChoice) => void }) {
  const orgs = useDb((db) => db.orgs)
  const cases = useDb((db) => db.testCases)
  const enc = value.label.startsWith('case:') ? value.label : `org:${value.orgId}`
  return (
    <Select
      value={enc}
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':')
        if (kind === 'org') onChange({ orgId: id, manualInputs: {}, label: `org:${id}` })
        else {
          const tc = cases.find((c) => c.id === id)
          if (tc) onChange({ orgId: tc.orgId, manualInputs: tc.manualInputs, label: `case:${tc.id}` })
        }
      }}
    >
      <optgroup label="Sample organisation">
        {orgs.map((o) => (
          <option key={o.id} value={`org:${o.id}`}>
            {o.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Saved test case">
        {cases.map((c) => (
          <option key={c.id} value={`case:${c.id}`}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </Select>
  )
}

function Blocks({ blocks, onJump }: { blocks: PromptBlock[]; onJump?: (key: string) => void }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i} className={cx('group rounded-[6px] px-2 py-1 -mx-2', onJump && b.key !== 'output' && 'cursor-pointer hover:bg-primary-50/60')} onClick={() => onJump?.(b.key)} title={onJump ? 'Edit this section' : undefined}>
          {b.heading && <div className="mb-0.5 font-mono text-[11px] font-semibold text-neutral-500">## {b.heading}</div>}
          <div className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-neutral-800">
            {b.segments.map((s, j) =>
              s.insert ? (
                <mark key={j} title={`${s.insert.name} · ${s.insert.source}`} className={cx('rounded px-0.5', !s.insert.resolved ? (s.insert.source === 'Unknown variable' ? 'bg-error-100 text-error-800 ring-1 ring-error-300' : 'bg-secondary-50 text-secondary-700') : 'bg-warning-50 text-neutral-800 ring-1 ring-warning-200')}>
                  {s.text.length > 1600 ? `${s.text.slice(0, 1600)}…` : s.text}
                </mark>
              ) : (
                <span key={j}>{s.text}</span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PromptPreview({ step, version, choice, onChoice, onJump }: { step: Step; version: PipelineVersion; choice: SampleChoice; onChoice: (c: SampleChoice) => void; onJump: (key: string) => void }) {
  const [mode, setMode] = useState<'resolved' | 'template'>('resolved')
  const [msg, setMsg] = useState<'system' | 'user' | 'output'>('system')
  const { resolved, snapshots, outputsFrom } = useSample(version, step, choice)
  const assembled = useMemo(() => assemblePrompt(step, version, mode === 'resolved' ? resolved : undefined), [step, version, mode, resolved])
  const unknown = assembled.unresolved
  return (
    <div className="surface flex max-h-[calc(100vh-170px)] flex-col">
      <div className="space-y-2 border-b border-neutral-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Prompt preview</h3>
          <div className="inline-flex overflow-hidden rounded-[6px] text-xs ring-1 ring-neutral-300">
            {(['resolved', 'template'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cx('px-2.5 py-1 font-medium', mode === m ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600')}>
                {m === 'resolved' ? 'With sample' : 'Template'}
              </button>
            ))}
          </div>
        </div>
        {mode === 'resolved' && <SamplePicker value={choice} onChange={onChoice} />}
        {unknown.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-[6px] bg-error-50 px-2 py-1.5 text-xs text-error-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Unresolved: {unknown.map((u) => `{{${u}}}`).join(', ')}
          </div>
        )}
        {mode === 'resolved' && <SnapshotSummary snapshots={snapshots} resolved={resolved} outputsFrom={outputsFrom} />}
      </div>
      <div className="px-3 pt-1">
        <Tabs
          value={msg}
          onChange={setMsg}
          tabs={[
            { id: 'system', label: 'Instructions' },
            { id: 'user', label: 'Supplied material' },
            { id: 'output', label: 'Output spec' },
          ]}
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {msg === 'system' && <Blocks blocks={assembled.system.filter((b) => b.key !== 'output')} onJump={onJump} />}
        {msg === 'user' && <Blocks blocks={assembled.user} />}
        {msg === 'output' && <pre className="whitespace-pre-wrap font-mono text-[12px] text-neutral-800">{assembled.outputSpec}</pre>}
      </div>
      <div className="border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-500">
        <span className="mr-2 rounded bg-warning-50 px-1 ring-1 ring-warning-200">highlighted</span> text was inserted from an input or earlier output. Hover to see its source. Click an instruction to edit it.
      </div>
    </div>
  )
}

function SnapshotSummary({ snapshots, resolved, outputsFrom }: { snapshots: InputSnapshot[]; resolved: ResolvedInput[]; outputsFrom: string }) {
  const dyn = snapshots.filter((s) => s.kind === 'dynamic')
  const missing = dyn.filter((s) => s.required && s.status === 'missing')
  return (
    <div className="space-y-0.5 text-[11px] text-neutral-500">
      <div>
        {dyn.map((s) => `${s.alias}: ${s.items.filter((i) => i.usable).length} usable`).join(' · ')}
        {missing.length > 0 && <span className="font-medium text-error-700"> · would stop as Missing input</span>}
      </div>
      {resolved.some((r) => r.sourceLabel.includes('→')) && <div>Earlier outputs from {outputsFrom}.</div>}
    </div>
  )
}
