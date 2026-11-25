import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDb } from '../data/store'
import { Card, fmtAgo, fmtGBP, PageHeader, Select, Stat, useNow } from '../ui/kit'
import { inPeriod, PERIODS } from './Requests'

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const period = params.get('period') ?? '14d'
  const pipelineId = params.get('pipeline') ?? ''
  const versionId = params.get('version') ?? ''
  const now = useNow()
  const navigate = useNavigate()
  const db = useDb((d) => d)

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k === 'pipeline') next.delete('version')
    setParams(next, { replace: true })
  }
  const filterQs = (extra: Record<string, string>) => {
    const q = new URLSearchParams()
    if (pipelineId) q.set('pipeline', pipelineId)
    if (versionId) q.set('version', versionId)
    q.set('period', period)
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `/requests?${q.toString()}`
  }

  const scoped = db.requests.filter((r) => (!pipelineId || r.pipelineId === pipelineId) && (!versionId || r.versionId === versionId))
  const inRange = scoped.filter((r) => inPeriod(r.submittedAt, period, now))
  const ids = new Set(inRange.map((r) => r.id))

  // 1. Queue (current state, not period-filtered)
  const waiting = scoped.filter((r) => r.status === 'queued' || r.status === 'retry_scheduled')
  const inProgress = scoped.filter((r) => r.status === 'in_progress')
  const oldestWaiting = waiting.filter((r) => r.status === 'queued').sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))[0]

  // 2. Completed and failed
  const completed = inRange.filter((r) => r.status === 'completed')
  const failed = inRange.filter((r) => r.status === 'failed')
  const reasons = countBy(failed.map((r) => r.finalReason ?? 'Unknown'))

  // 3. Missing inputs
  const missing = inRange.filter((r) => r.status === 'missing_input')
  const missingTypes = countBy(missing.flatMap((r) => r.missingInputs?.map((m) => m.typeRef ?? m.alias) ?? []))

  // 4. Retries
  const retried = inRange.filter((r) => r.attemptCount > 1)
  const extraAttempts = retried.reduce((n, r) => n + r.attemptCount - 1, 0)

  // 5. Manual review (current state)
  const scopedIds = new Set(scoped.map((r) => r.id))
  const openReviews = db.reviews.filter((r) => r.status === 'open' && scopedIds.has(r.requestId)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))

  // 6. Cost (production only)
  const execs = db.executions.filter((e) => ids.has(e.ownerId) && e.status !== 'reused' && e.stepType !== 'check')
  const totalCost = execs.reduce((n, e) => n + (e.costGBP ?? 0), 0)
  const unpriced = execs.filter((e) => e.costGBP === null)
  const byModel = groupSum(execs, (e) => (e.model ? `${e.model.provider} · ${e.model.modelId}` : 'Unknown'))
  const byPipeline = groupSum(execs, (e) => db.pipelines.find((p) => p.id === db.requests.find((r) => r.id === e.ownerId)?.pipelineId)?.name ?? '?')
  const testCost = db.testRuns.filter((r) => (!pipelineId || r.pipelineId === pipelineId) && inPeriod(r.startedAt, period, now)).reduce((n, r) => n + r.simulatedCostGBP, 0)

  // 7. Delivery
  const deliveries = db.deliveries.filter((d) => ids.has(d.requestId))
  const dCount = { pending: 0, delivered: 0, failed: 0 }
  for (const d of deliveries) dCount[d.status]++
  const failedDeliveries = deliveries.filter((d) => d.status === 'failed')

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Dashboard"
        subtitle="Production processing only. Test runs are reported separately."
        actions={
          <div className="flex gap-2">
            <Select className="w-56" value={pipelineId} onChange={(e) => set('pipeline', e.target.value)}>
              <option value="">All pipelines</option>
              {db.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select className="w-32" value={versionId} onChange={(e) => set('version', e.target.value)} disabled={!pipelineId}>
              <option value="">All versions</option>
              {db.versions
                .filter((v) => v.pipelineId === pipelineId && v.state === 'published')
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    V{v.number}
                  </option>
                ))}
            </Select>
            <Select className="w-40" value={period} onChange={(e) => set('period', e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Waiting in queue" value={waiting.length} tone="primary" hint={<>{waiting.filter((r) => r.status === 'retry_scheduled').length} retry scheduled · oldest {oldestWaiting ? fmtAgo(oldestWaiting.queuedAt, now).replace(' ago', '') : '—'}</>} onClick={() => navigate('/requests?status=queued,retry_scheduled')} />
        <Stat label="In progress" value={inProgress.length} tone="info" hint="Held by a worker lease" onClick={() => navigate('/requests?status=in_progress')} />
        <Stat label="Completed" value={completed.length} tone="success" hint={`${failed.length} failed · ${missing.length} missing input`} onClick={() => navigate(filterQs({ status: 'completed' }))} />
        <Stat label="Awaiting manual review" value={openReviews.length} tone="warning" hint={openReviews[0] ? `Oldest waiting ${fmtAgo(openReviews[0].createdAt, now).replace(' ago', '')}` : 'None open'} onClick={() => navigate('/reviews')} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card title="Failed" subtitle="Final failure reasons" actions={<Drill to={filterQs({ status: 'failed' })} />}>
          <Breakdown rows={reasons} empty="No failures in this period" link={(k) => filterQs({ status: 'failed', reason: k })} />
        </Card>
        <Card title="Missing inputs" subtitle="Stopped before any AI call · £0.00 AI cost" actions={<Drill to={filterQs({ status: 'missing_input' })} />}>
          <div className="mb-2 text-2xl font-semibold tabular-nums">{missing.length}</div>
          <Breakdown rows={missingTypes} empty="None in this period" label="Missing type reference" />
        </Card>
        <Card title="Retries" actions={<Drill to={filterQs({ retried: '1' })} />}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{retried.length}</div>
              <div className="text-xs text-neutral-500">requests that retried</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{extraAttempts}</div>
              <div className="text-xs text-neutral-500">additional attempts</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500">Attempt 1 is the initial run. Each restart from a step counts as another attempt.</div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card title="Awaiting manual review" subtitle="Why each case was referred" padded={false} actions={<Drill to="/reviews" />}>
          <ul className="divide-y divide-neutral-100">
            {openReviews.map((r) => (
              <li key={r.id}>
                <Link to={`/reviews/${r.id}`} className="block px-4 py-2 text-sm hover:bg-neutral-50">
                  <div className="flex justify-between">
                    <span className="font-mono text-xs text-primary-700">{r.requestId}</span>
                    <span className="text-xs text-neutral-400">{fmtAgo(r.createdAt, now)}</span>
                  </div>
                  <div className="text-xs text-neutral-600">{r.reason}</div>
                </Link>
              </li>
            ))}
            {openReviews.length === 0 && <li className="px-4 py-4 text-sm text-neutral-500">No open cases.</li>}
          </ul>
        </Card>
        <Card title="Estimated AI cost" subtitle={`${execs.length} model calls · based on recorded usage and rates`}>
          <div className="text-2xl font-semibold tabular-nums">{fmtGBP(totalCost, 2)}</div>
          {unpriced.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-warning-800">
              <AlertTriangle className="size-3.5" /> {unpriced.length} call{unpriced.length === 1 ? '' : 's'} with no rate recorded; not included
            </div>
          )}
          <div className="mt-3 text-xs font-medium text-neutral-500">By pipeline</div>
          <MoneyRows rows={byPipeline} />
          <div className="mt-3 text-xs font-medium text-neutral-500">By model</div>
          <MoneyRows rows={byModel} />
          <div className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
            Test activity (simulated, separate): <strong className="text-neutral-700">{fmtGBP(testCost, 2)}</strong>
          </div>
        </Card>
        <Card title="Delivery status" subtitle="Athena · shown alongside processing status" actions={<Drill to={filterQs({ delivery: 'failed' })} label="Failed" />}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <DeliveryCount label="Pending" n={dCount.pending} to={filterQs({ delivery: 'pending' })} />
            <DeliveryCount label="Delivered" n={dCount.delivered} to={filterQs({ delivery: 'delivered' })} />
            <DeliveryCount label="Failed" n={dCount.failed} to={filterQs({ delivery: 'failed' })} danger />
          </div>
          {failedDeliveries.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {failedDeliveries.map((d) => (
                <li key={d.id}>
                  <Link to={`/requests/${d.requestId}`} className="block rounded-[6px] border border-error-200 bg-error-50/50 px-2.5 py-1.5 text-xs hover:bg-error-50">
                    <span className="font-mono text-primary-700">{d.requestId}</span> · Athena
                    <div className="text-error-700">{d.latestError}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function countBy(items: string[]): [string, number][] {
  const m = new Map<string, number>()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function groupSum<T extends { costGBP?: number | null }>(items: T[], key: (t: T) => string): [string, number, number][] {
  const m = new Map<string, [number, number]>()
  for (const i of items) {
    const k = key(i)
    const cur = m.get(k) ?? [0, 0]
    if (i.costGBP === null) cur[1]++
    else cur[0] += i.costGBP ?? 0
    m.set(k, cur)
  }
  return [...m.entries()].map(([k, [c, u]]) => [k, c, u] as [string, number, number]).sort((a, b) => b[1] - a[1])
}

function Breakdown({ rows, empty, link, label }: { rows: [string, number][]; empty: string; link?: (k: string) => string; label?: string }) {
  if (!rows.length) return <div className="text-sm text-neutral-500">{empty}</div>
  return (
    <div>
      {label && <div className="mb-1 text-xs text-neutral-500">{label}</div>}
      <ul className="space-y-1">
        {rows.map(([k, n]) => (
          <li key={k} className="flex items-center justify-between gap-2 text-sm">
            {link ? (
              <Link to={link(k)} className="truncate text-neutral-700 hover:text-primary-700 hover:underline">
                {k}
              </Link>
            ) : (
              <span className="truncate font-mono text-xs text-neutral-700">{k}</span>
            )}
            <span className="tabular-nums font-medium text-neutral-900">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MoneyRows({ rows }: { rows: [string, number, number][] }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {rows.map(([k, c, u]) => (
        <li key={k} className="flex justify-between gap-2 text-sm">
          <span className="truncate text-neutral-700">{k}</span>
          <span className="shrink-0 tabular-nums text-neutral-900">
            {fmtGBP(c)}
            {u > 0 && <span className="ml-1 text-xs text-warning-700">+{u} unpriced</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DeliveryCount({ label, n, to, danger }: { label: string; n: number; to: string; danger?: boolean }) {
  return (
    <Link to={to} className="rounded-[6px] border border-neutral-200 px-2 py-2 hover:bg-neutral-50">
      <div className={`text-xl font-semibold tabular-nums ${danger && n > 0 ? 'text-error-700' : 'text-neutral-900'}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  )
}

function Drill({ to, label = 'View' }: { to: string; label?: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
      {label} <ArrowRight className="size-3" />
    </Link>
  )
}
