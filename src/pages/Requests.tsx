import { Search, X } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDb } from '../data/store'
import type { PipelineRequest } from '../domain/types'
import { DeliveryBadge, OrgName, STATUS_META, StatusBadge } from '../ui/domain'
import { Badge, Button, fmtAgo, fmtDate, fmtGBP, Mono, PageHeader, Select, TextInput, useNow } from '../ui/kit'

export const PERIODS: { id: string; label: string; ms: number | null }[] = [
  { id: '24h', label: 'Last 24 hours', ms: 864e5 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 864e5 },
  { id: '14d', label: 'Last 14 days', ms: 14 * 864e5 },
  { id: 'all', label: 'All time', ms: null },
]

export function inPeriod(iso: string, period: string, now: number) {
  const p = PERIODS.find((x) => x.id === period)
  return !p?.ms || now - Date.parse(iso) <= p.ms
}

export default function Requests() {
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const requests = useDb((db) => db.requests)
  const pipelines = useDb((db) => db.pipelines)
  const versions = useDb((db) => db.versions)
  const deliveries = useDb((db) => db.deliveries)
  const executions = useDb((db) => db.executions)
  const orgs = useDb((db) => db.orgs)
  const navigate = useNavigate()

  const f = {
    pipeline: params.get('pipeline') ?? '',
    version: params.get('version') ?? '',
    status: params.get('status') ?? '',
    delivery: params.get('delivery') ?? '',
    period: params.get('period') ?? 'all',
    org: params.get('org') ?? '',
    retried: params.get('retried') ?? '',
    reason: params.get('reason') ?? '',
    q: params.get('q') ?? '',
  }
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k === 'pipeline') next.delete('version')
    setParams(next, { replace: true })
  }

  const costByReq = useMemo(() => {
    const m = new Map<string, { cost: number; unknown: boolean }>()
    for (const e of executions) {
      const c = m.get(e.ownerId) ?? { cost: 0, unknown: false }
      if (e.costGBP === null && e.status !== 'reused') c.unknown = true
      else c.cost += e.costGBP ?? 0
      m.set(e.ownerId, c)
    }
    return m
  }, [executions])

  const rows = requests
    .filter((r) => !f.pipeline || r.pipelineId === f.pipeline)
    .filter((r) => !f.version || r.versionId === f.version)
    .filter((r) => !f.status || f.status.split(',').includes(r.status))
    .filter((r) => !f.org || r.orgId === f.org)
    .filter((r) => !f.retried || r.attemptCount > 1)
    .filter((r) => !f.reason || r.finalReason === f.reason)
    .filter((r) => inPeriod(r.submittedAt, f.period, now))
    .filter((r) => {
      if (!f.delivery) return true
      const d = deliveries.find((x) => x.requestId === r.id)
      return d?.status === f.delivery
    })
    .filter((r) => !f.q || r.id.toLowerCase().includes(f.q.toLowerCase()) || r.submissionRef.toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))

  const active = Object.entries(f).filter(([k, v]) => v && !(k === 'period' && v === 'all'))

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Requests" subtitle="Every request shows the version it was assigned, its processing status and its delivery status." />
      <div className="surface mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-neutral-400" />
          <TextInput className="w-52 pl-7" placeholder="Request ID or reference" value={f.q} onChange={(e) => set('q', e.target.value)} />
        </div>
        <Select className="w-56" value={f.pipeline} onChange={(e) => set('pipeline', e.target.value)}>
          <option value="">All pipelines</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select className="w-32" value={f.version} onChange={(e) => set('version', e.target.value)}>
          <option value="">All versions</option>
          {versions
            .filter((v) => v.state === 'published' && (!f.pipeline || v.pipelineId === f.pipeline))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {f.pipeline ? '' : `${pipelines.find((p) => p.id === v.pipelineId)?.name.slice(0, 12)}… `}V{v.number}
              </option>
            ))}
        </Select>
        <Select className="w-44" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>
          {(Object.keys(STATUS_META) as PipelineRequest['status'][]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
          <option value="queued,retry_scheduled">Waiting (queue)</option>
        </Select>
        <Select className="w-40" value={f.delivery} onChange={(e) => set('delivery', e.target.value)}>
          <option value="">Any delivery</option>
          <option value="pending">Delivery pending</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Delivery failed</option>
        </Select>
        <Select className="w-40" value={f.org} onChange={(e) => set('org', e.target.value)}>
          <option value="">Any organisation</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <Select className="w-36" value={f.period} onChange={(e) => set('period', e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {active.length > 0 && (
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setParams({}, { replace: true })}>
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-neutral-500">{rows.length} requests</span>
      </div>
      {(f.retried || f.reason) && (
        <div className="mb-3 flex gap-2">
          {f.retried && <Badge color="info">Retried requests only</Badge>}
          {f.reason && <Badge color="error">Reason: {f.reason}</Badge>}
        </div>
      )}
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Request</th>
              <th className="px-4 py-2 font-medium">Pipeline</th>
              <th className="px-4 py-2 font-medium">Organisation</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Processing</th>
              <th className="px-4 py-2 font-medium">Delivery</th>
              <th className="px-4 py-2 text-right font-medium">Attempts</th>
              <th className="px-4 py-2 text-right font-medium">Est. cost</th>
              <th className="px-4 py-2 text-right font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => {
              const v = versions.find((x) => x.id === r.versionId)
              const c = costByReq.get(r.id)
              const pl = pipelines.find((p) => p.id === r.pipelineId)
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-2.5">
                    <Mono className="text-primary-700">{r.id}</Mono>
                    <div className="max-w-[180px] truncate font-mono text-[10.5px] text-neutral-400">{r.submissionRef}</div>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-neutral-600">{pl?.name}</td>
                  <td className="px-4 py-2.5">
                    <OrgName id={r.orgId} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge color={pl?.activeVersionId === r.versionId ? 'primary' : 'neutral'}>V{v?.number}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                    {r.status === 'retry_scheduled' && r.nextEligibleAt && <div className="mt-0.5 text-[11px] text-neutral-500">eligible {fmtAgo(r.nextEligibleAt, now)}</div>}
                    {(r.status === 'failed' || r.status === 'missing_input') && r.finalReason && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-neutral-500">{r.finalReason}</div>}
                    {r.status === 'awaiting_review' && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-neutral-500">{r.reviewReason}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <DeliveryBadge delivery={deliveries.find((d) => d.requestId === r.id)} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.attemptCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">
                    {c ? fmtGBP(c.cost) : '£0.00'}
                    {c?.unknown && <span className="ml-1 text-warning-600" title="Some calls have no rate">*</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-neutral-500" title={fmtDate(r.submittedAt)}>
                    {fmtAgo(r.submittedAt, now)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">* Includes calls with no recorded rate; the estimate is incomplete.</p>
    </div>
  )
}
