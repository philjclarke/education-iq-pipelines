import { ArrowDown, ArrowUp, CornerDownRight, Flag, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Step } from '../../domain/types'
import { describeCondition } from '../../engine/routing'
import { blankStep } from '../../services/config'
import { ActionBadge, StepTypeIcon } from '../../ui/domain'
import { Badge, Button, cx, EmptyState, Modal, toast } from '../../ui/kit'
import { useVersion } from './context'
import { StepEditor } from './StepEditor'

export default function StepsTab() {
  const { stepId } = useParams()
  const { version, base } = useVersion()
  const steps = [...version.steps].sort((a, b) => a.displayOrder - b.displayOrder)
  const selected = steps.find((s) => s.id === stepId) ?? steps[0]
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('ediq-flow-collapsed')
      if (saved) return saved === '1'
    } catch {
      /* ignore */
    }
    return window.innerWidth < 1600
  })
  const toggle = () => {
    setCollapsed(!collapsed)
    try {
      localStorage.setItem('ediq-flow-collapsed', collapsed ? '0' : '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cx('grid gap-5 p-6', collapsed ? 'grid-cols-[52px_minmax(0,1fr)]' : 'grid-cols-[290px_minmax(0,1fr)]')}>
      {collapsed ? <FlowRail steps={steps} selectedId={selected?.id} onExpand={toggle} /> : <FlowPanel steps={steps} selectedId={selected?.id} onCollapse={toggle} />}
      <div className="min-w-0">
        {selected ? (
          <StepEditor key={selected.id} step={selected} />
        ) : (
          <EmptyState title="No steps yet">
            Add a generation step to start. <Link className="text-primary-700" to={base}>Run settings</Link>
          </EmptyState>
        )}
      </div>
    </div>
  )
}

function FlowRail({ steps, selectedId, onExpand }: { steps: Step[]; selectedId?: string; onExpand: () => void }) {
  const { version, base, issues } = useVersion()
  const navigate = useNavigate()
  return (
    <div className="sticky top-4 flex flex-col items-center gap-1.5 self-start">
      <Button size="sm" variant="ghost" icon={<PanelLeftOpen className="size-4" />} onClick={onExpand} title="Show pipeline flow" />
      {steps.map((s, i) => {
        const errs = issues.some((x) => x.stepId === s.id && x.severity === 'error')
        return (
          <div key={s.id} className="flex flex-col items-center">
            {i > 0 && <div className="h-2 w-px bg-neutral-300" />}
            <button
              type="button"
              title={`${s.name}${version.entryStepId === s.id ? ' (entry)' : ''}`}
              onClick={() => navigate(`${base}/steps/${s.id}`)}
              className={cx('relative rounded-[8px] border bg-white p-1', s.id === selectedId ? 'border-primary-400 shadow-[0_0_0_3px] shadow-primary-100' : 'border-neutral-200 hover:border-neutral-300')}
            >
              <StepTypeIcon type={s.type} />
              {errs && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-error-500 ring-2 ring-white" />}
              {version.entryStepId === s.id && <Flag className="absolute -left-1.5 -top-1.5 size-3 text-success-600" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function FlowPanel({ steps, selectedId, onCollapse }: { steps: Step[]; selectedId?: string; onCollapse: () => void }) {
  const { version, readOnly, edit, base, issues } = useVersion()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Step | null>(null)
  const name = (id: string | null) => version.steps.find((s) => s.id === id)?.name ?? '?'

  const move = (step: Step, dir: -1 | 1) =>
    edit((v) => {
      const sorted = [...v.steps].sort((a, b) => a.displayOrder - b.displayOrder)
      const i = sorted.findIndex((s) => s.id === step.id)
      const j = i + dir
      if (j < 0 || j >= sorted.length) return
      ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
      sorted.forEach((s, k) => {
        const real = v.steps.find((x) => x.id === s.id)
        if (real) real.displayOrder = k + 1
      })
    })

  const add = (type: Step['type']) => {
    const n = version.steps.length + 1
    const labels = { generate: ['generate', 'Generate'], validate: ['validate', 'Validate'], check: ['check', 'Check'] } as const
    const s = blankStep(type, n, `${labels[type][0]}_${n}`, `${labels[type][1]} step ${n}`)
    if (type === 'validate') {
      s.prompt.verdicts = [
        { value: 'pass', meaning: 'Meets every criterion.' },
        { value: 'fail', meaning: 'Fails at least one criterion.' },
      ]
    }
    edit((v) => {
      v.steps.push(s)
      if (!v.entryStepId) v.entryStepId = s.id
    })
    setAddOpen(false)
    navigate(`${base}/steps/${s.id}`)
  }

  return (
    <div className="sticky top-4 self-start">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pipeline flow</h2>
        <div className="flex gap-1">
          {!readOnly && (
            <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => setAddOpen(true)}>
              Add step
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<PanelLeftClose className="size-4" />} onClick={onCollapse} title="Collapse" />
        </div>
      </div>
      <p className="mb-3 text-xs text-neutral-500">Display order helps you read the pipeline. The routes control execution.</p>
      <div className="scroll-thin max-h-[calc(100vh-230px)] space-y-0 overflow-y-auto pr-1">
        {steps.map((s, i) => {
          const errs = issues.filter((x) => x.stepId === s.id && x.severity === 'error').length
          return (
            <div key={s.id}>
              {version.entryStepId === s.id && (
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-success-700">
                  <Flag className="size-3" /> Entry
                </div>
              )}
              <div
                className={cx(
                  'group cursor-pointer rounded-[8px] border bg-white p-2.5 transition-shadow',
                  s.id === selectedId ? 'border-primary-400 shadow-[0_0_0_3px] shadow-primary-100' : 'border-neutral-200 hover:border-neutral-300',
                )}
                onClick={() => navigate(`${base}/steps/${s.id}`)}
              >
                <div className="flex items-center gap-2">
                  <StepTypeIcon type={s.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-900">{s.name}</div>
                    <div className="truncate font-mono text-[11px] text-neutral-400">{s.code}</div>
                  </div>
                  {errs > 0 && <Badge color="error">{errs}</Badge>}
                  {version.resultStepId === s.id && <Badge color="info">result</Badge>}
                </div>
                <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                  {s.rules.map((r) => (
                    <li key={r.id} className="flex items-start gap-1 text-[11px]">
                      <CornerDownRight className="mt-0.5 size-3 shrink-0 text-neutral-300" />
                      <span className="min-w-0 flex-1 truncate text-neutral-500" title={describeCondition(r.when)}>
                        {r.label}
                      </span>
                      <ActionBadge action={r.action} stepName={name} />
                    </li>
                  ))}
                  <li className="flex items-start gap-1 text-[11px]">
                    <CornerDownRight className="mt-0.5 size-3 shrink-0 text-neutral-300" />
                    <span className="flex-1 italic text-neutral-400">otherwise</span>
                    <ActionBadge action={s.defaultRoute} stepName={name} />
                  </li>
                </ul>
                {!readOnly && (
                  <div className="mt-1.5 hidden justify-end gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" disabled={i === 0} icon={<ArrowUp className="size-3" />} onClick={() => move(s, -1)} title="Move up" />
                    <Button size="sm" variant="ghost" disabled={i === steps.length - 1} icon={<ArrowDown className="size-3" />} onClick={() => move(s, 1)} title="Move down" />
                    <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3" />} onClick={() => setConfirmDelete(s)} title="Delete step" />
                  </div>
                )}
              </div>
              {i < steps.length - 1 && <div className="mx-auto h-3 w-px bg-neutral-300" />}
            </div>
          )
        })}
      </div>
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a step">
        <div className="grid gap-2">
          {(
            [
              ['generate', 'Generation', 'A model produces structured output from inputs, e.g. a summary or classification.'],
              ['validate', 'Model-based validation', 'A model checks an earlier output against evidence and returns a verdict with reasons. Can use a different provider.'],
              ['check', 'Deterministic check', 'Rules run without a model call: word limits, valid evidence references, required values.'],
            ] as const
          ).map(([type, label, desc]) => (
            <button key={type} type="button" onClick={() => add(type)} className="flex items-start gap-3 rounded-[8px] border border-neutral-200 p-3 text-left hover:border-primary-300 hover:bg-primary-50/40">
              <StepTypeIcon type={type} />
              <div>
                <div className="font-medium text-neutral-900">{label}</div>
                <div className="text-xs text-neutral-500">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name}?`}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              tone="error"
              variant="solid"
              onClick={() => {
                const id = confirmDelete?.id
                edit((v) => {
                  v.steps = v.steps.filter((s) => s.id !== id)
                  if (v.entryStepId === id) v.entryStepId = v.steps[0]?.id ?? null
                  if (v.resultStepId === id) v.resultStepId = null
                })
                setConfirmDelete(null)
                toast('Step deleted. Any routes or bindings that pointed to it are now flagged.', 'info')
                navigate(`${base}/steps`)
              }}
            >
              Delete step
            </Button>
          </>
        }
      >
        Routes and bindings that refer to this step will be flagged until you fix them.
      </Modal>
    </div>
  )
}
