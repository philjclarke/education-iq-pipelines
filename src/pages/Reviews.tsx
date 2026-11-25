import { Check, Loader2, Pencil, RotateCcw, UserCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { access, useDb } from '../data/store'
import type { ManualReview, OutputField } from '../domain/types'
import { realClock } from '../engine/util'
import { decideReview, ReviewError, reviewContext } from '../services/reviews'
import { OrgName, UserName } from '../ui/domain'
import { Badge, Button, Card, cx, EmptyState, fmtAgo, fmtDate, Label, PageHeader, Select, TextArea, TextInput, toast, useNow } from '../ui/kit'
import { ResultSummary } from './version/TestsTab'

export default function Reviews() {
  const { reviewId } = useParams()
  const now = useNow()
  const reviews = useDb((db) => db.reviews)
  const requests = useDb((db) => db.requests)
  const pipelines = useDb((db) => db.pipelines)
  const versions = useDb((db) => db.versions)
  const navigate = useNavigate()
  const open = reviews.filter((r) => r.status === 'open').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const resolved = reviews.filter((r) => r.status === 'resolved').sort((a, b) => ((a.decidedAt ?? '') < (b.decidedAt ?? '') ? 1 : -1))
  const selected = reviews.find((r) => r.id === reviewId) ?? open[0]

  const Item = ({ r }: { r: ManualReview }) => {
    const req = requests.find((x) => x.id === r.requestId)
    const v = versions.find((x) => x.id === req?.versionId)
    return (
      <button type="button" onClick={() => navigate(`/reviews/${r.id}`)} className={cx('w-full px-4 py-2.5 text-left hover:bg-neutral-50', selected?.id === r.id && 'bg-primary-50/60')}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-primary-700">{r.requestId}</span>
          <Badge color="primary">V{v?.number}</Badge>
          <span className="ml-auto text-[11px] text-neutral-400">{r.status === 'open' ? `waiting ${fmtAgo(r.createdAt, now).replace(' ago', '')}` : fmtAgo(r.decidedAt, now)}</span>
        </div>
        <div className="mt-0.5 text-sm font-medium text-neutral-800">
          <OrgName id={req?.orgId ?? null} />
        </div>
        <div className="truncate text-xs text-neutral-500">{pipelines.find((p) => p.id === req?.pipelineId)?.name}</div>
        <div className={cx('mt-1 text-xs', r.status === 'open' ? 'text-warning-800' : 'text-neutral-500')}>{r.status === 'open' ? r.reason : `${r.decision?.replace('_', ' ')} · ${r.reason}`}</div>
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Manual review" subtitle="Approve the candidate, edit and approve it, reject it, or rerun from an eligible step. The original candidate is always kept." />
      <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-5">
        <div className="space-y-4">
          <Card title={`Open (${open.length})`} subtitle={open.length ? `Oldest waiting ${fmtAgo(open[0].createdAt, now).replace(' ago', '')}` : undefined} padded={false}>
            <div className="divide-y divide-neutral-100">
              {open.map((r) => (
                <Item key={r.id} r={r} />
              ))}
              {open.length === 0 && <div className="px-4 py-6 text-center text-sm text-neutral-500">Nothing waiting.</div>}
            </div>
          </Card>
          <Card title="Recently resolved" padded={false}>
            <div className="scroll-thin max-h-80 divide-y divide-neutral-100 overflow-y-auto">
              {resolved.map((r) => (
                <Item key={r.id} r={r} />
              ))}
            </div>
          </Card>
        </div>
        <div className="min-w-0">{selected ? <ReviewPanel key={selected.id} review={selected} /> : <EmptyState title="No reviews" icon={<UserCheck className="size-6" />} />}</div>
      </div>
    </div>
  )
}

function ReviewPanel({ review }: { review: ManualReview }) {
  const db = useDb((d) => d)
  const { request, version, remaining, eligible, resultStep } = reviewContext(db, review)
  const userId = db.currentUserId
  const snapshots = db.snapshots.filter((s) => s.ownerId === request.id)
  const execs = db.executions.filter((e) => e.ownerId === request.id && e.attemptId === review.attemptId)
  const findings = execs.filter((e) => e.stepType === 'validate' && e.structured && e.status !== 'reused')
  const [mode, setMode] = useState<'view' | 'edit' | 'reject' | 'rerun'>('view')
  const [draft, setDraft] = useState<Record<string, unknown>>(structuredClone(review.candidate))
  const [reason, setReason] = useState('')
  const [fromStep, setFromStep] = useState(eligible.find((s) => s.id === version.resultStepId)?.id ?? eligible[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cited = new Set((review.candidate.evidence_refs as string[] | undefined) ?? [])

  const act = async (decision: Parameters<typeof decideReview>[2]) => {
    setBusy(true)
    setError(null)
    try {
      await decideReview(access, review.id, decision, { actorId: userId, clock: realClock, simulateLatency: true })
      toast(decision.kind === 'rerun' ? 'Rerun complete. See the request for the new attempt.' : 'Decision recorded')
      setMode('view')
    } catch (e) {
      setError(e instanceof ReviewError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm">
              <Link to={`/requests/${request.id}`} className="font-mono text-primary-700 hover:underline">
                {request.id}
              </Link>
              <Badge color="primary">V{version.number}</Badge>
              <span className="text-neutral-500">
                <OrgName id={request.orgId} />
              </span>
            </div>
            <div className="mt-1 text-[15px] font-semibold text-warning-800">{review.reason}</div>
            <div className="mt-0.5 text-xs text-neutral-500">
              Candidate from {version.steps.find((s) => s.id === review.sourceStepId)?.name} · referred {fmtDate(review.createdAt)}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-neutral-500">Attempts remaining</div>
            <div className={cx('text-lg font-semibold', remaining === 0 ? 'text-error-700' : 'text-neutral-900')}>
              {remaining} <span className="text-xs font-normal text-neutral-400">of {version.maxRequestAttempts}</span>
            </div>
          </div>
        </div>
        {review.status === 'resolved' && (
          <div className="mt-3 rounded-[6px] bg-neutral-100 px-3 py-2 text-sm">
            <Badge color={review.decision === 'rejected' ? 'error' : 'success'}>{review.decision?.replace('_', ' ')}</Badge> by <UserName id={review.reviewerId} /> · {fmtDate(review.decidedAt)}
            {review.decisionReason && <span className="italic text-neutral-600"> · “{review.decisionReason}”</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title={mode === 'edit' ? 'Edit the candidate' : 'Candidate output'} subtitle={review.editedOutput ? 'Original candidate (an edited version was approved)' : undefined}>
          {mode === 'edit' && resultStep ? (
            <EditForm fields={resultStep.outputSchema} value={draft} onChange={setDraft} />
          ) : (
            <ResultSummary structured={review.candidate} />
          )}
          {review.editedOutput && (
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <div className="mb-1 text-xs font-medium text-success-700">Approved edit</div>
              <ResultSummary structured={review.editedOutput} />
            </div>
          )}
        </Card>
        <Card title="Validator findings">
          {findings.length === 0 && <div className="text-sm text-neutral-500">No validator ran in this attempt.</div>}
          <div className="space-y-2">
            {findings.map((e) => (
              <div key={e.id}>
                <div className="text-xs font-medium text-neutral-600">
                  {e.stepName}: <span className="font-mono">{String(e.structured?.verdict)}</span>
                  {typeof e.structured?.confidence === 'number' && ` · confidence ${e.structured.confidence}`}
                </div>
                {(e.structured?.findings as Record<string, unknown>[] | undefined)?.map((f, i) => (
                  <div key={i} className="mt-1 rounded-[6px] border border-neutral-200 px-2.5 py-1.5 text-xs">
                    <Badge color={f.severity === 'material' ? 'error' : f.severity === 'correctable' ? 'warning' : 'neutral'}>{String(f.severity)}</Badge> <span className="font-medium">{String(f.criterion)}</span>
                    <div className="mt-0.5 text-neutral-700">“{String(f.claim)}”</div>
                    <div className="text-neutral-500">{String(f.explanation)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Source excerpts" subtitle="From the request’s immutable snapshot. Cited excerpts are highlighted.">
        <div className="grid grid-cols-2 gap-2">
          {snapshots
            .filter((s) => s.kind === 'dynamic')
            .flatMap((s) => s.items.filter((i) => i.usable).map((i) => ({ ...i, alias: s.alias })))
            .map((i) => (
              <div key={i.sourceRowId} className={cx('rounded-[6px] border px-3 py-2 text-xs', cited.has(i.sourceRowId ?? '') ? 'border-success-300 bg-success-50/50' : 'border-neutral-200')}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-primary-700">{i.sourceRowId}</span>
                  <span className="font-medium text-neutral-700">{i.title}</span>
                  {cited.has(i.sourceRowId ?? '') && <Badge color="success">cited</Badge>}
                </div>
                <p className="mt-1 text-neutral-600">{i.content}</p>
              </div>
            ))}
        </div>
      </Card>

      {review.status === 'open' && (
        <Card title="Decision">
          {error && <div className="mb-3 rounded-[6px] border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">{error}</div>}
          {mode !== 'view' && (
            <div className="mb-3 space-y-3">
              {mode === 'rerun' && (
                <div className="flex items-center gap-2">
                  <Label>Rerun from</Label>
                  <Select className="w-72" value={fromStep} onChange={(e) => setFromStep(e.target.value)}>
                    {eligible.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs text-neutral-500">Uses 1 of {remaining} remaining attempts. Earlier outputs are reused.</span>
                </div>
              )}
              <div>
                <Label required={mode === 'reject'}>Reason</Label>
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'reject' ? 'Why is this candidate rejected?' : 'Optional note for the audit history'} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {mode === 'view' ? (
              <>
                <Button variant="solid" tone="success" disabled={busy} icon={<Check className="size-4" />} onClick={() => act({ kind: 'approve', reason })}>
                  Approve candidate
                </Button>
                <Button icon={<Pencil className="size-4" />} onClick={() => setMode('edit')}>
                  Edit and approve
                </Button>
                <Button tone="error" icon={<X className="size-4" />} onClick={() => setMode('reject')}>
                  Reject
                </Button>
                <Button icon={<RotateCcw className="size-4" />} disabled={remaining === 0 || eligible.length === 0} onClick={() => setMode('rerun')} title={remaining === 0 ? 'No attempts remain' : undefined}>
                  Rerun from a step
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="solid"
                  tone={mode === 'reject' ? 'error' : 'primary'}
                  disabled={busy || (mode === 'reject' && !reason.trim())}
                  icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
                  onClick={() => act(mode === 'edit' ? { kind: 'edit', output: draft, reason } : mode === 'reject' ? { kind: 'reject', reason } : { kind: 'rerun', fromStepId: fromStep, reason })}
                >
                  {mode === 'edit' ? 'Approve edited output' : mode === 'reject' ? 'Reject candidate' : 'Start rerun'}
                </Button>
                <Button onClick={() => setMode('view')} disabled={busy}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function EditForm({ fields, value, onChange }: { fields: OutputField[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2.5">
      {fields.map((f) => (
        <div key={f.id}>
          <Label required={f.required && !f.requiredForOutcomes?.length}>
            <span className="font-mono text-xs">{f.name}</span>
          </Label>
          {f.type === 'string' ? (
            <TextArea rows={f.name === 'summary' ? 6 : 2} value={String(value[f.name] ?? '')} onChange={(e) => onChange({ ...value, [f.name]: e.target.value })} />
          ) : f.type === 'enum' ? (
            <Select value={String(value[f.name] ?? '')} onChange={(e) => onChange({ ...value, [f.name]: e.target.value })}>
              <option value="">—</option>
              {(f.allowedValues ?? []).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          ) : f.type === 'string_list' ? (
            <TextInput className="font-mono text-xs" value={Array.isArray(value[f.name]) ? (value[f.name] as string[]).join(', ') : ''} onChange={(e) => onChange({ ...value, [f.name]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          ) : f.type === 'number' ? (
            <TextInput type="number" value={String(value[f.name] ?? '')} onChange={(e) => onChange({ ...value, [f.name]: Number(e.target.value) })} />
          ) : (
            <div className="text-xs text-neutral-400">Not editable here</div>
          )}
        </div>
      ))}
      {typeof value.summary === 'string' && <div className="text-right text-[11px] text-neutral-500">{value.summary.trim().split(/\s+/).filter(Boolean).length} words</div>}
    </div>
  )
}
