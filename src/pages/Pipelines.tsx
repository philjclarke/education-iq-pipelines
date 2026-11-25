import { Plus, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { access, useDb } from '../data/store'
import type { Pipeline } from '../domain/types'
import { createPipeline } from '../services/config'
import { VersionBadge } from '../ui/domain'
import { Badge, Button, CopyButton, EmptyState, Label, Modal, Mono, PageHeader, Select, TextArea, TextInput, toast } from '../ui/kit'

export default function Pipelines() {
  const pipelines = useDb((db) => db.pipelines)
  const versions = useDb((db) => db.versions)
  const requests = useDb((db) => db.requests)
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Pipelines"
        subtitle="Each pipeline has a permanent key that upstream processes use to submit work. Publishing a version changes what new requests receive."
        actions={
          <Button variant="solid" tone="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
            New pipeline
          </Button>
        }
      />
      {pipelines.length === 0 && <EmptyState title="No pipelines yet" icon={<Workflow className="size-6" />} />}
      <div className="grid gap-4">
        {pipelines.map((p) => {
          const active = versions.find((v) => v.id === p.activeVersionId)
          const draft = versions.find((v) => v.pipelineId === p.id && v.state === 'draft')
          const reqs = requests.filter((r) => r.pipelineId === p.id)
          const done = reqs.filter((r) => r.status === 'completed').length
          const review = reqs.filter((r) => r.status === 'awaiting_review').length
          return (
            <div key={p.id} className="surface p-5">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <Link to={`/pipelines/${p.id}`} className="text-lg font-semibold text-neutral-900 hover:text-primary-700">
                    {p.name}
                  </Link>
                  <p className="mt-1 max-w-3xl text-sm text-neutral-500">{p.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-[6px] bg-neutral-50 py-1 pl-2.5 pr-1 ring-1 ring-neutral-200">
                      <Mono className="text-neutral-700">{p.key}</Mono>
                      <CopyButton value={p.key} label="Copy key" />
                    </div>
                    <Badge>{p.taskKind.replace('_', ' ')}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500">Published</span>
                    {active ? <VersionBadge version={active} /> : <span className="text-neutral-400">none</span>}
                  </div>
                  {draft && (
                    <Link to={`/pipelines/${p.id}/versions/${draft.id}`} className="flex items-center gap-2 text-sm hover:underline">
                      <span className="text-neutral-500">Draft</span>
                      <VersionBadge version={draft} />
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-6 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                <span>
                  <strong className="text-neutral-800">{reqs.length}</strong> requests
                </span>
                <span>
                  <strong className="text-neutral-800">{done}</strong> completed
                </span>
                <span>
                  <strong className="text-neutral-800">{review}</strong> awaiting review
                </span>
                <span className="ml-auto flex gap-2">
                  {active && (
                    <Link to={`/pipelines/${p.id}/versions/${active.id}`}>
                      <Button size="sm">View V{active.number}</Button>
                    </Link>
                  )}
                  {draft && (
                    <Link to={`/pipelines/${p.id}/versions/${draft.id}`}>
                      <Button size="sm" variant="soft" tone="primary">
                        Edit draft V{draft.number}
                      </Button>
                    </Link>
                  )}
                  <Link to={`/pipelines/${p.id}`}>
                    <Button size="sm" variant="ghost">
                      Details
                    </Button>
                  </Link>
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <NewPipelineModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function NewPipelineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [taskKind, setTaskKind] = useState<Pipeline['taskKind']>('evidence_summary')
  const userId = useDb((db) => db.currentUserId)
  const navigate = useNavigate()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New pipeline"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="solid"
            tone="primary"
            disabled={!name.trim()}
            onClick={() => {
              const { pipelineId, versionId } = createPipeline(access, { name: name.trim(), description: description.trim(), taskKind, actorId: userId, at: new Date().toISOString() })
              onClose()
              setName('')
              setDescription('')
              toast('Pipeline created with draft V1')
              navigate(`/pipelines/${pipelineId}/versions/${versionId}`)
            }}
          >
            Create pipeline
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label required>Name</Label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Procurement signals from auditor reports" autoFocus />
        </div>
        <div>
          <Label>Purpose</Label>
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this pipeline produce, and who uses it?" />
        </div>
        <div>
          <Label>Kind of task</Label>
          <Select value={taskKind} onChange={(e) => setTaskKind(e.target.value as Pipeline['taskKind'])}>
            <option value="evidence_summary">Evidence summary</option>
            <option value="classification">Classification</option>
            <option value="extraction">Extraction</option>
          </Select>
          <p className="mt-1 text-xs text-neutral-500">Used to suggest starter questions and examples in the prompt builder.</p>
        </div>
        <p className="text-xs text-neutral-500">A permanent pipeline key is generated when you create the pipeline.</p>
      </div>
    </Modal>
  )
}
