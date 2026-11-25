import { ChevronDown, ChevronRight, Clock, Loader2, Recycle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { PipelineVersion, RequestAttempt, StepExecution } from '../domain/types'
import { describeAction } from '../engine/routing'
import { ActionBadge, ModelChip, OutcomeBadge, PassIcon, StepTypeIcon } from './domain'
import { Badge, CodeBlock, cx, fmtDuration, fmtGBP, fmtTime, Json, Tabs } from './kit'

const TRIGGER_LABEL: Record<RequestAttempt['trigger'], string> = {
  initial: 'Initial run',
  retry_rule: 'Retry rule',
  manual_rerun: 'Recovery rerun',
  reviewer_rerun: 'Reviewer rerun',
}

const OUTCOME_LABEL: Record<RequestAttempt['outcome'], { text: string; color: 'success' | 'info' | 'error' | 'warning' | 'primary' | 'neutral' }> = {
  running: { text: 'Running', color: 'primary' },
  completed: { text: 'Completed', color: 'success' },
  retried: { text: 'Retried', color: 'info' },
  failed: { text: 'Failed', color: 'error' },
  manual_review: { text: 'To manual review', color: 'warning' },
  interrupted: { text: 'Interrupted', color: 'neutral' },
}

export function Trace({ attempts, executions, version, simulated, focusExecutionId }: { attempts: RequestAttempt[]; executions: StepExecution[]; version: PipelineVersion; simulated?: boolean; focusExecutionId?: string }) {
  if (!attempts.length) return <div className="text-sm text-neutral-500">No attempts yet.</div>
  return (
    <div className="space-y-4">
      {attempts.map((a) => {
        const execs = executions.filter((e) => e.attemptId === a.id)
        const o = OUTCOME_LABEL[a.outcome]
        return (
          <div key={a.id} className="fade-in">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-neutral-900">Attempt {a.number}</span>
              <Badge color="primary">V{version.number}</Badge>
              <Badge color={a.trigger === 'initial' ? 'neutral' : 'info'}>
                {a.trigger !== 'initial' && <RotateCcw className="size-3" />}
                {TRIGGER_LABEL[a.trigger]}
              </Badge>
              <span className="text-xs text-neutral-500">from {version.steps.find((s) => s.id === a.startingStepId)?.name}</span>
              {a.triggerDetail && <span className="text-xs text-neutral-500">· {a.triggerDetail}</span>}
              <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                {fmtTime(a.startedAt)}
                <Badge color={o.color}>
                  {a.outcome === 'running' && <Loader2 className="size-3 animate-spin" />}
                  {o.text}
                </Badge>
              </span>
            </div>
            <div className="relative space-y-2 border-l-2 border-neutral-200 pl-4">
              {execs.map((e) => (
                <ExecutionCard key={e.id} e={e} version={version} executions={executions} attempts={attempts} simulated={simulated} defaultOpen={e.id === focusExecutionId} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExecutionCard({ e, version, executions, attempts, simulated, defaultOpen }: { e: StepExecution; version: PipelineVersion; executions: StepExecution[]; attempts: RequestAttempt[]; simulated?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [tab, setTab] = useState<'result' | 'inputs' | 'prompt' | 'raw' | 'route' | 'usage'>('result')
  const stepName = (id: string | null) => version.steps.find((s) => s.id === id)?.name ?? '?'
  const producer = e.reusedFromExecutionId ? executions.find((x) => x.id === e.reusedFromExecutionId) : undefined
  const producerAttempt = producer ? attempts.find((a) => a.id === producer.attemptId) : undefined
  const running = e.status === 'running'
  const findings = Array.isArray(e.structured?.findings) ? (e.structured?.findings as Record<string, unknown>[]) : []

  return (
    <div className={cx('fade-in relative rounded-[8px] border bg-white', running ? 'border-primary-300' : e.status === 'reused' ? 'border-dashed border-neutral-300 bg-neutral-50/70' : 'border-neutral-200')}>
      <span className={cx('absolute -left-[22px] top-4 size-2.5 rounded-full ring-2 ring-white', running ? 'live-dot bg-primary-500' : e.status === 'reused' ? 'bg-neutral-300' : e.outcome === 'success' ? 'bg-success-500' : 'bg-warning-500')} />
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="size-4 text-neutral-400" /> : <ChevronRight className="size-4 text-neutral-400" />}
        <StepTypeIcon type={e.stepType} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-neutral-900">{e.stepName}</span>
            {e.invocation > 1 && e.status !== 'reused' && <span className="text-xs text-neutral-400">call #{e.invocation}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {e.status === 'reused' ? (
              <Badge>
                <Recycle className="size-3" />
                Reused from attempt {producerAttempt?.number ?? '?'}
              </Badge>
            ) : (
              e.model && <ModelChip provider={e.model.provider} model={e.model.modelId} />
            )}
            {e.stepType === 'check' && e.status !== 'reused' && <Badge>No model call</Badge>}
            {running ? (
              <span className="inline-flex items-center gap-1 text-xs text-primary-700">
                <Loader2 className="size-3 animate-spin" /> {e.stepType === 'check' ? 'Checking…' : 'Waiting for model…'}
              </span>
            ) : (
              e.status !== 'reused' && <OutcomeBadge outcome={e.outcome} />
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {e.action && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              {e.matchedRule?.label}
              <ActionBadge action={e.action} stepName={stepName} />
            </span>
          )}
          {!running && e.status !== 'reused' && (
            <span className="flex items-center gap-2 text-[11px] text-neutral-400">
              <Clock className="size-3" />
              {fmtDuration(e.durationMs)}
              {e.costGBP !== undefined && (
                <span className={cx(e.costGBP === null && 'text-warning-700')}>
                  {e.costGBP === null ? 'cost unavailable' : `${fmtGBP(e.costGBP)}${simulated ? ' (simulated)' : ''}`}
                </span>
              )}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-3 pb-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'result', label: 'Result' },
              { id: 'inputs', label: `Inputs (${e.resolvedInputs.length})` },
              ...(e.renderedPrompt ? [{ id: 'prompt' as const, label: 'Rendered prompt' }] : []),
              ...(e.rawOutput !== undefined && e.stepType !== 'check' ? [{ id: 'raw' as const, label: 'Raw response' }] : []),
              { id: 'route', label: 'Why this route' },
              { id: 'usage', label: 'Timing & cost' },
            ]}
          />
          <div className="pt-3">
            {tab === 'result' && (
              <div className="space-y-3">
                {e.status === 'reused' && producer && (
                  <div className="rounded-[6px] bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
                    Output produced by execution <span className="font-mono">{producer.id}</span> in attempt {producerAttempt?.number}. No new model call was made.
                  </div>
                )}
                {e.error && <div className="rounded-[6px] border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-800">{e.error}</div>}
                {e.schemaErrors.length > 0 && (
                  <div className="rounded-[6px] border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-800">
                    <div className="font-semibold">Output failed validation</div>
                    <ul className="mt-1 list-disc pl-4">
                      {e.schemaErrors.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {e.checks.length > 0 && (
                  <ul className="space-y-1">
                    {e.checks.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <PassIcon passed={c.passed} />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-neutral-500">{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {findings.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-500">Validation findings</div>
                    <div className="space-y-1.5">
                      {findings.map((f, i) => (
                        <div key={i} className={cx('rounded-[6px] border px-3 py-2 text-xs', f.severity === 'material' ? 'border-error-200 bg-error-50/60' : f.severity === 'correctable' ? 'border-warning-200 bg-warning-50/60' : 'border-neutral-200 bg-neutral-50')}>
                          <div className="flex items-center gap-2">
                            <Badge color={f.severity === 'material' ? 'error' : f.severity === 'correctable' ? 'warning' : 'neutral'}>{String(f.severity)}</Badge>
                            <span className="font-medium text-neutral-800">{String(f.criterion)}</span>
                            {f.source_ref ? <span className="ml-auto font-mono text-[11px] text-neutral-500">{String(f.source_ref)}</span> : null}
                          </div>
                          <div className="mt-1 text-neutral-700">
                            <span className="text-neutral-500">Claim:</span> {String(f.claim)}
                          </div>
                          <div className="mt-0.5 text-neutral-600">{String(f.explanation)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {e.structured && <Json value={e.structured} maxH="max-h-72" />}
                {!e.structured && !e.error && !e.schemaErrors.length && running && <div className="text-sm text-neutral-500">Waiting for the result…</div>}
              </div>
            )}
            {tab === 'inputs' && (
              <div className="space-y-2">
                {e.resolvedInputs.map((r) => (
                  <div key={r.name} className="rounded-[6px] border border-neutral-200">
                    <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-2.5 py-1.5 text-xs">
                      <span className="font-mono font-medium text-neutral-800">{r.name}</span>
                      <Badge>{r.role}</Badge>
                      <span className="text-neutral-500">{r.sourceLabel}</span>
                      {r.sourceRowIds.length > 0 && <span className="ml-auto font-mono text-[11px] text-neutral-500">{r.sourceRowIds.join(', ')}</span>}
                    </div>
                    <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11.5px] text-neutral-700">{r.value}</pre>
                  </div>
                ))}
                {e.resolvedInputs.length === 0 && <div className="text-sm text-neutral-500">No bindings.</div>}
              </div>
            )}
            {tab === 'prompt' && e.renderedPrompt && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-500">System message</div>
                <CodeBlock>{e.renderedPrompt.system}</CodeBlock>
                <div className="text-xs font-medium text-neutral-500">User message</div>
                <CodeBlock>{e.renderedPrompt.user}</CodeBlock>
              </div>
            )}
            {tab === 'raw' && <CodeBlock>{e.rawOutput || '(no response)'}</CodeBlock>}
            {tab === 'route' && (
              <div className="space-y-2">
                {e.action ? (
                  <>
                    <div className="text-sm">
                      Standard outcome <OutcomeBadge outcome={e.outcome} /> → <strong>{e.matchedRule?.label}</strong> → {describeAction(e.action, stepName)}
                    </div>
                    <CodeBlock>{e.matchedRule?.explanation.join('\n')}</CodeBlock>
                  </>
                ) : (
                  <div className="text-sm text-neutral-500">{e.status === 'reused' ? 'Reused outputs are not re-routed.' : 'Routing happens when the step finishes.'}</div>
                )}
              </div>
            )}
            {tab === 'usage' && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-neutral-500">Started</dt>
                <dd>{fmtTime(e.startedAt)}</dd>
                <dt className="text-neutral-500">Duration</dt>
                <dd>{fmtDuration(e.durationMs)}</dd>
                <dt className="text-neutral-500">Input tokens</dt>
                <dd>{e.usage?.inputTokens?.toLocaleString() ?? '—'}</dd>
                <dt className="text-neutral-500">Output tokens</dt>
                <dd>{e.usage?.outputTokens?.toLocaleString() ?? '—'}</dd>
                <dt className="text-neutral-500">Estimated cost</dt>
                <dd>
                  {e.costGBP === null ? <span className="text-warning-700">Unavailable</span> : fmtGBP(e.costGBP)} {simulated && <Badge color="secondary">simulated</Badge>}
                </dd>
                <dt className="text-neutral-500">Rate used</dt>
                <dd className="font-mono text-xs">{e.rateId ?? '—'}</dd>
                {e.model && (
                  <>
                    <dt className="text-neutral-500">Settings</dt>
                    <dd className="font-mono text-xs">{JSON.stringify(e.model.settings)}</dd>
                  </>
                )}
                {e.costNote && (
                  <>
                    <dt className="text-neutral-500">Note</dt>
                    <dd className="text-xs text-neutral-600">{e.costNote}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
