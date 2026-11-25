import { GitBranchPlus, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { access, useDb } from '../data/store'
import { ConfigError, createDraftFrom } from '../services/config'
import { DeliveryBadge, OrgName, StatusBadge, UserName, VersionBadge } from '../ui/domain'
import { Badge, Button, Card, CopyButton, fmtDate, Mono, PageHeader, toast } from '../ui/kit'
import { SubmitRequestModal } from '../ui/SubmitRequestModal'

export default function PipelineDetail() {
  const { pipelineId } = useParams()
  const pipeline = useDb((db) => db.pipelines.find((p) => p.id === pipelineId))
  const versions = useDb((db) => db.versions.filter((v) => v.pipelineId === pipelineId).sort((a, b) => b.number - a.number))
  const requests = useDb((db) => db.requests.filter((r) => r.pipelineId === pipelineId))
  const deliveries = useDb((db) => db.deliveries)
  const userId = useDb((db) => db.currentUserId)
  const navigate = useNavigate()
  const [submitOpen, setSubmitOpen] = useState(false)
  if (!pipeline) return <div className="p-8">Pipeline not found.</div>
  const draft = versions.find((v) => v.state === 'draft')
  const recent = [...requests].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)).slice(0, 12)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        eyebrow={<Link to="/pipelines" className="hover:underline">Pipelines</Link>}
        title={pipeline.name}
        subtitle={pipeline.description}
        actions={
          <Button icon={<Send className="size-4" />} onClick={() => setSubmitOpen(true)} disabled={!pipeline.activeVersionId}>
            Submit request
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-4">
        <Card title="Pipeline key" subtitle="Upstream processes use this key to submit work. It never changes." className="col-span-2">
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-[6px] bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-800 ring-1 ring-neutral-200">{pipeline.key}</code>
            <CopyButton value={pipeline.key} label="Copy key" />
          </div>
        </Card>
        <Card title="Owner">
          <div className="text-sm">
            <UserName id={pipeline.ownerId} />
          </div>
          <div className="mt-1 text-xs text-neutral-500">Created {fmtDate(pipeline.createdAt, false)}</div>
        </Card>
      </div>

      <Card title="Versions" subtitle="New requests receive the active published version. Earlier versions stay available for the requests assigned to them." className="mt-4" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Change</th>
              <th className="px-4 py-2 font-medium">Author</th>
              <th className="px-4 py-2 font-medium">Published</th>
              <th className="px-4 py-2 font-medium">Approved by</th>
              <th className="px-4 py-2 font-medium text-right">Requests</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {versions.map((v) => (
              <tr key={v.id} className="hover:bg-neutral-50/60">
                <td className="px-4 py-2.5">
                  <VersionBadge version={v} active={v.id === pipeline.activeVersionId} />
                </td>
                <td className="max-w-xs px-4 py-2.5 text-neutral-600">{v.changeNote || <span className="text-neutral-400">—</span>}</td>
                <td className="px-4 py-2.5">
                  <UserName id={v.authorId} />
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{v.publishedAt ? <>{fmtDate(v.publishedAt)} by <UserName id={v.publishedById} /></> : '—'}</td>
                <td className="px-4 py-2.5 text-neutral-600">{v.approvedBy ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {requests.filter((r) => r.versionId === v.id).length ? (
                    <Link className="text-primary-700 hover:underline" to={`/requests?pipeline=${pipeline.id}&version=${v.id}`}>
                      {requests.filter((r) => r.versionId === v.id).length}
                    </Link>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <Link to={`/pipelines/${pipeline.id}/versions/${v.id}`}>
                      <Button size="sm" variant={v.state === 'draft' ? 'soft' : 'outline'} tone={v.state === 'draft' ? 'primary' : 'neutral'}>
                        {v.state === 'draft' ? 'Edit draft' : 'Open'}
                      </Button>
                    </Link>
                    {v.state === 'published' && !draft && (
                      <Button
                        size="sm"
                        icon={<GitBranchPlus className="size-3.5" />}
                        onClick={() => {
                          try {
                            const id = createDraftFrom(access, v.id, userId, new Date().toISOString())
                            toast(`Draft created from V${v.number}`)
                            navigate(`/pipelines/${pipeline.id}/versions/${id}`)
                          } catch (e) {
                            toast(e instanceof ConfigError ? e.message : String(e), 'error')
                          }
                        }}
                      >
                        Create draft from this version
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Recent requests"
        className="mt-4"
        padded={false}
        actions={
          <Link to={`/requests?pipeline=${pipeline.id}`} className="text-sm text-primary-700 hover:underline">
            View all
          </Link>
        }
      >
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {recent.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => navigate(`/requests/${r.id}`)}>
                <td className="px-4 py-2">
                  <Mono className="text-primary-700">{r.id}</Mono>
                </td>
                <td className="px-4 py-2">
                  <OrgName id={r.orgId} />
                </td>
                <td className="px-4 py-2">
                  <Badge color="primary">V{versions.find((v) => v.id === r.versionId)?.number}</Badge>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2">
                  <DeliveryBadge delivery={deliveries.find((d) => d.requestId === r.id)} />
                </td>
                <td className="px-4 py-2 text-right text-neutral-500">{fmtDate(r.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <SubmitRequestModal open={submitOpen} onClose={() => setSubmitOpen(false)} pipelineKey={pipeline.key} />
    </div>
  )
}
