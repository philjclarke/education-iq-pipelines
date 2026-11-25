import { ExternalLink, Loader2, Play, RefreshCw, UserCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { access, useDb } from '../data/store'
import { realClock } from '../engine/util'
import { deliverResult } from '../services/requests'
import { runOne, useWorker } from '../services/worker'
import { DeliveryBadge, OrgName, StatusBadge, UserName } from '../ui/domain'
import { Badge, Button, Card, Collapsible, cx, fmtAgo, fmtDate, fmtGBP, fmtTime, Json, Mono, toast, useNow } from '../ui/kit'
import { Trace } from '../ui/Trace'
import { ResultSummary } from './version/TestsTab'

export default function RequestDetail() {
  const { requestId } = useParams()
  const now = useNow(5000)
  const request = useDb((db) => db.requests.find((r) => r.id === requestId))
  const pipeline = useDb((db) => db.pipelines.find((p) => p.id === request?.pipelineId))
  const version = useDb((db) => db.versions.find((v) => v.id === request?.versionId))
  const activeVersion = useDb((db) => db.versions.find((v) => v.id === pipeline?.activeVersionId))
  const snapshots = useDb((db) => db.snapshots.filter((s) => s.ownerId === requestId))
  const attempts = useDb((db) => db.attempts.filter((a) => a.ownerId === requestId))
  const executions = useDb((db) => db.executions.filter((e) => e.ownerId === requestId))
  const result = useDb((db) => db.results.find((r) => r.requestId === requestId))
  const delivery = useDb((db) => db.deliveries.find((d) => d.requestId === requestId))
  const reviews = useDb((db) => db.reviews.filter((r) => r.requestId === requestId))
  const audit = useDb((db) => db.audit.filter((a) => a.requestId === requestId))
  const userId = useDb((db) => db.currentUserId)
  const worker = useWorker()
  const [delivering, setDelivering] = useState(false)
  if (!request || !version || !pipeline) return <div className="p-8">Request not found.</div>

  const modelCalls = executions.filter((e) => e.stepType !== 'check' && e.status !== 'reused' && e.status !== 'running').length
  const totalCost = executions.reduce((n, e) => n + (e.costGBP ?? 0), 0)
  const unknownCost = executions.some((e) => e.costGBP === null)
  const routed = executions.filter((e) => e.action)
  const openReview = reviews.find((r) => r.status === 'open')
  const lastReview = reviews[reviews.length - 1]
  const cited = new Set(result?.evidenceRefs ?? [])
  const processing = worker.current === request.id

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="text-xs text-neutral-500">
        <Link to="/requests" className="hover:underline">
          Requests
        </Link>{' '}
        /{' '}
        <Link to={`/pipelines/${pipeline.id}`} className="hover:underline">
          {pipeline.name}
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <span className="font-mono">{request.id}</span>
            <StatusBadge status={request.status} />
            <DeliveryBadge delivery={delivery} />
            {processing && (
              <span className="inline-flex items-center gap-1.5 text-sm font-normal text-primary-700">
                <span className="live-dot size-2 rounded-full bg-primary-500" /> live
              </span>
            )}
          </h1>
          <div className="mt-1 text-sm text-neutral-500">
            <OrgName id={request.orgId} link /> · submission ref <Mono>{request.submissionRef}</Mono> · submitted {fmtDate(request.submittedAt)}
          </div>
        </div>
        <div className="flex gap-2">
          {(request.status === 'queued' || request.status === 'retry_scheduled') && (
            <Button variant="solid" tone="primary" disabled={worker.running} icon={worker.running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} onClick={() => runOne(request.id)}>
              {request.status === 'retry_scheduled' ? 'Run retry now' : 'Process now'}
            </Button>
          )}
          {openReview && (
            <Link to={`/reviews/${openReview.id}`}>
              <Button variant="solid" tone="warning" icon={<UserCheck className="size-4" />}>
                Open review
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* The four questions */}
      <div className="mt-5 grid grid-cols-2 gap-4 2xl:grid-cols-4">
        <Question title="What version ran?">
          <div className="flex items-center gap-2">
            <Badge color="primary" className="text-sm">V{version.number}</Badge>
            <span className="text-xs text-neutral-500">assigned at submission</span>
          </div>
          <div className="mt-2 text-xs text-neutral-600">
            Published {fmtDate(version.publishedAt)} · approved by {version.approvedBy}
          </div>
          {activeVersion && activeVersion.id !== version.id && (
            <div className="mt-2 rounded-[6px] bg-info-50 px-2 py-1.5 text-xs text-info-800">
              The pipeline now publishes V{activeVersion.number}. This request keeps V{version.number}.
            </div>
          )}
          <Link to={`/pipelines/${pipeline.id}/versions/${version.id}`} className="mt-2 inline-block text-xs text-primary-700 hover:underline">
            View V{version.number} configuration
          </Link>
        </Question>
        <Question title="What evidence was used?">
          {snapshots.length === 0 ? (
            <div className="text-sm text-neutral-500">Inputs are captured when the worker first claims the request.</div>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {snapshots.map((s) => {
                const usable = s.items.filter((i) => i.usable)
                return (
                  <li key={s.id}>
                    <div className="flex items-center gap-1.5">
                      <Mono className="font-medium text-neutral-800">{s.alias}</Mono>
                      {s.status === 'missing' ? <Badge color={s.required ? 'error' : 'neutral'}>{s.required ? 'missing' : 'none'}</Badge> : <span className="text-neutral-500">{s.kind === 'fixed' ? 'fixed' : `${usable.length} record${usable.length === 1 ? '' : 's'}`}</span>}
                    </div>
                    {s.kind === 'dynamic' && usable.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {usable.map((i) => (
                          <span key={i.sourceRowId} className={cx('rounded px-1 font-mono text-[10.5px]', cited.has(i.sourceRowId ?? '') ? 'bg-success-100 text-success-800' : 'bg-neutral-100 text-neutral-600')} title={cited.has(i.sourceRowId ?? '') ? 'Cited in the result' : undefined}>
                            {i.sourceRowId}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {request.status === 'missing_input' && (
            <div className="mt-2 rounded-[6px] bg-secondary-50 px-2 py-1.5 text-xs text-secondary-800">
              Missing: {request.missingInputs?.map((m) => `${m.typeRef ?? m.alias} (${m.reason})`).join('; ')}
            </div>
          )}
        </Question>
        <Question title="Why did it take this route?">
          {request.status === 'missing_input' ? (
            <div className="text-sm text-neutral-700">
              Stopped before any AI call because a required input was missing. <strong>0 model calls</strong>, £0.00.
            </div>
          ) : routed.length === 0 ? (
            <div className="text-sm text-neutral-500">Not routed yet.</div>
          ) : (
            <ol className="space-y-1 text-xs">
              {routed.map((e) => (
                <li key={e.id} className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-neutral-400">A{attempts.find((a) => a.id === e.attemptId)?.number}</span>
                  <span>
                    <strong className="font-medium text-neutral-800">{e.stepName}</strong>
                    <span className="text-neutral-500"> · {e.matchedRule?.label}</span>
                    {e.stepType === 'validate' && e.structured && (
                      <span className="text-neutral-500">
                        {' '}
                        ({String(e.structured.verdict)}
                        {typeof e.structured.confidence === 'number' ? `, ${e.structured.confidence}` : ''})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {request.finalReason && request.status !== 'missing_input' && <div className="mt-2 text-xs font-medium text-error-700">{request.finalReason}</div>}
          {request.reviewReason && request.status === 'awaiting_review' && <div className="mt-2 text-xs font-medium text-warning-800">{request.reviewReason}</div>}
        </Question>
        <Question title="What was the final result?">
          {result ? (
            <>
              <ResultSummary structured={result.payload} compact />
              <div className="mt-2 text-xs text-neutral-500">
                {result.approval.kind === 'automatic' ? 'Approved automatically by the pipeline' : <>Approved by {result.approval.by}{result.approval.edited && <Badge color="warning" className="ml-1">edited</Badge>}</>} · {fmtDate(result.approval.at)}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">
              {request.status === 'awaiting_review' ? 'Waiting for a reviewer decision.' : request.status === 'failed' ? 'No result: the request failed.' : request.status === 'missing_input' ? 'No result.' : 'Not finished yet.'}
            </div>
          )}
          {delivery && (
            <div className="mt-3 border-t border-neutral-100 pt-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500">Athena</span>
                <DeliveryBadge delivery={delivery} />
                <span className="text-neutral-400">{delivery.attempts.length} attempt{delivery.attempts.length === 1 ? '' : 's'}</span>
              </div>
              {delivery.latestError && <div className="mt-1 text-xs text-error-700">{delivery.latestError}</div>}
              {delivery.status === 'failed' && result && (
                <Button
                  size="sm"
                  className="mt-2"
                  tone="primary"
                  variant="soft"
                  disabled={delivering}
                  icon={delivering ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  onClick={async () => {
                    setDelivering(true)
                    await deliverResult(access, result.id, { clock: realClock, simulateLatency: true, actorId: userId })
                    setDelivering(false)
                    const d = access.get().deliveries.find((x) => x.id === delivery.id)
                    toast(d?.status === 'delivered' ? 'Delivered to Athena. AI attempt history is unchanged.' : `Delivery failed again: ${d?.latestError}`, d?.status === 'delivered' ? 'success' : 'error')
                  }}
                >
                  Retry delivery
                </Button>
              )}
            </div>
          )}
        </Question>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4">
          <Card title="Attempt history" padded={false}>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Attempt</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">Trigger</th>
                  <th className="px-4 py-2 font-medium">Started from</th>
                  <th className="px-4 py-2 font-medium">Outcome</th>
                  <th className="px-4 py-2 text-right font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">#{a.number}</td>
                    <td className="px-4 py-2">
                      <Badge color="primary">V{version.number}</Badge>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {a.trigger.replace('_', ' ')}
                      {a.triggerDetail && <div className="max-w-xs truncate text-[11px] text-neutral-400">{a.triggerDetail}</div>}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{version.steps.find((s) => s.id === a.startingStepId)?.name}</td>
                    <td className="px-4 py-2">{a.outcome.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-right text-xs text-neutral-500">{fmtDate(a.startedAt)}</td>
                  </tr>
                ))}
                {attempts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-sm text-neutral-500">
                      {request.status === 'missing_input' ? 'No attempts: the request stopped at input checks, before attempt 1.' : 'No attempts yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <Card title="Chronological trace" subtitle="Expand a step for inputs, rendered prompt, raw response, structured result, routing, timing and cost.">
            {request.status === 'missing_input' ? (
              <div className="rounded-[6px] bg-secondary-50 px-3 py-2 text-sm text-secondary-800">No model calls were made.</div>
            ) : (
              <Trace attempts={attempts} executions={executions} version={version} focusExecutionId={openReview?.sourceExecutionId} />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Summary">
            <dl className="space-y-1.5 text-sm">
              <Row k="Pipeline">{pipeline.name}</Row>
              <Row k="Organisation">
                <OrgName id={request.orgId} />
              </Row>
              <Row k="Attempts">
                {request.attemptCount} of {version.maxRequestAttempts}
              </Row>
              <Row k="Model calls">{modelCalls}</Row>
              <Row k="Estimated cost">
                {fmtGBP(totalCost)}
                {unknownCost && <span className="ml-1 text-xs text-warning-700">(incomplete)</span>}
              </Row>
              <Row k="Queued">{fmtTime(request.queuedAt)}</Row>
              <Row k="Finished">{request.finishedAt ? fmtDate(request.finishedAt) : '—'}</Row>
              {request.status === 'retry_scheduled' && <Row k="Next eligible">{fmtAgo(request.nextEligibleAt, now)}</Row>}
              {request.lease && <Row k="Lease">{request.lease.workerId} until {fmtTime(request.lease.expiresAt)}</Row>}
            </dl>
          </Card>
          {lastReview && (
            <Card title="Manual review">
              <div className="text-sm">
                <div className="text-neutral-700">{lastReview.reason}</div>
                {lastReview.status === 'resolved' ? (
                  <div className="mt-2 text-xs text-neutral-500">
                    <Badge color={lastReview.decision === 'rejected' ? 'error' : 'success'}>{lastReview.decision?.replace('_', ' ')}</Badge> by <UserName id={lastReview.reviewerId} /> · {fmtDate(lastReview.decidedAt)}
                    {lastReview.decisionReason && <p className="mt-1 italic">“{lastReview.decisionReason}”</p>}
                  </div>
                ) : (
                  <Link to={`/reviews/${lastReview.id}`} className="mt-2 inline-block text-xs text-primary-700 hover:underline">
                    Review now
                  </Link>
                )}
                {lastReview.editedOutput && (
                  <Collapsible title="Original candidate (retained)" className="mt-2">
                    <Json value={lastReview.candidate} maxH="max-h-48" />
                  </Collapsible>
                )}
              </div>
            </Card>
          )}
          {delivery?.payload && (
            <Card title="Athena payload">
              <Json value={delivery.payload} maxH="max-h-56" />
              <div className="mt-1 font-mono text-[10.5px] text-neutral-400">key {delivery.deliveryKey}</div>
            </Card>
          )}
          <Card title="Audit history" padded={false}>
            <ol className="scroll-thin max-h-96 divide-y divide-neutral-100 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="px-4 py-2 text-xs">
                  <div className="flex justify-between text-neutral-400">
                    <span>{a.kind.replace(/_/g, ' ')}</span>
                    <span>{fmtTime(a.at)}</span>
                  </div>
                  <div className="text-neutral-700">{a.message}</div>
                  <div className="text-neutral-400">
                    <UserName id={a.actorId} />
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          {snapshots.some((s) => s.kind === 'dynamic' && s.items.length) && (
            <Card title="Captured snapshot" subtitle="Immutable for this request. Later source changes do not affect it.">
              <div className="space-y-2">
                {snapshots
                  .filter((s) => s.kind === 'dynamic')
                  .flatMap((s) => s.items)
                  .map((i) => (
                    <div key={`${i.sourceRowId}`} className={cx('rounded-[6px] border px-2 py-1.5 text-xs', i.usable ? 'border-neutral-200' : 'border-error-200 bg-error-50/50')}>
                      <div className="flex items-center gap-1.5">
                        <Mono className="text-primary-700">{i.sourceRowId}</Mono>
                        <span className="truncate text-neutral-600">{i.title}</span>
                        {i.sourceUrl && (
                          <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto text-neutral-400">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {!i.usable && <div className="text-error-700">{i.issue}</div>}
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="surface p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right text-neutral-800">{children}</dd>
    </div>
  )
}
