import { Link, useSearchParams } from 'react-router-dom'
import { useDb } from '../data/store'
import type { AuditKind } from '../domain/types'
import { UserName } from '../ui/domain'
import { Badge, fmtDate, PageHeader, Select } from '../ui/kit'

const KINDS: AuditKind[] = ['version_published', 'draft_created', 'pipeline_created', 'request_submitted', 'request_claimed', 'input_captured', 'status_changed', 'routed', 'retry_scheduled', 'review_created', 'review_decided', 'result_saved', 'delivery_attempted', 'lease_recovered']

export default function Activity() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') ?? ''
  const audit = useDb((db) => db.audit)
  const rows = [...audit].filter((a) => !kind || a.kind === kind).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 400)
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Audit log"
        subtitle="Append-only history of publication, input capture, status changes, routing, retries, human decisions and delivery."
        actions={
          <Select className="w-56" value={kind} onChange={(e) => setParams(e.target.value ? { kind: e.target.value } : {}, { replace: true })}>
            <option value="">All events</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        }
      />
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Detail</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Related</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500">{fmtDate(a.at)}</td>
                <td className="px-4 py-2">
                  <Badge>{a.kind.replace(/_/g, ' ')}</Badge>
                </td>
                <td className="px-4 py-2 text-neutral-700">{a.message}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  <UserName id={a.actorId} />
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                  {a.requestId && (
                    <Link to={`/requests/${a.requestId}`} className="text-primary-700 hover:underline">
                      {a.requestId}
                    </Link>
                  )}
                  {a.versionId && a.pipelineId && !a.requestId && (
                    <Link to={`/pipelines/${a.pipelineId}/versions/${a.versionId}`} className="text-primary-700 hover:underline">
                      version
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
