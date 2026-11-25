import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { access, useDb } from '../data/store'
import { SCENARIOS } from '../engine/mockProvider'
import { ORG_DEFAULT_SCENARIO } from '../seed/pipelines'
import { submitRequest, SubmitError } from '../services/requests'
import { runOne } from '../services/worker'
import { Button, Label, Modal, Select, TextInput, Toggle, toast } from './kit'

/** Simulates the upstream loader submitting work with a pipeline key. */
export function SubmitRequestModal({ open, onClose, pipelineKey }: { open: boolean; onClose: () => void; pipelineKey?: string }) {
  const pipelines = useDb((db) => db.pipelines)
  const versions = useDb((db) => db.versions)
  const orgs = useDb((db) => db.orgs)
  const userId = useDb((db) => db.currentUserId)
  const [key, setKey] = useState(pipelineKey ?? pipelines[0]?.key ?? '')
  const [orgId, setOrgId] = useState('org-millbrook')
  const [ref, setRef] = useState('')
  const [scenario, setScenario] = useState(ORG_DEFAULT_SCENARIO['org-millbrook'])
  const [processNow, setProcessNow] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setRef(`manual-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.floor(Math.random() * 900 + 100)}`)
      setError(null)
      if (pipelineKey) setKey(pipelineKey)
    }
  }, [open, pipelineKey])

  const pipeline = pipelines.find((p) => p.key === key.trim())
  const active = versions.find((v) => v.id === pipeline?.activeVersionId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit a request"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="solid"
            tone="primary"
            onClick={() => {
              try {
                const { request, duplicate } = submitRequest(access, { pipelineKey: key, orgId, submissionRef: ref.trim(), scenario, actorId: userId, at: new Date().toISOString() })
                onClose()
                if (duplicate) toast(`Submission reference already used: returned existing ${request.id}`, 'info')
                else toast(`${request.id} queued on V${versions.find((v) => v.id === request.versionId)?.number}`)
                navigate(`/requests/${request.id}`)
                if (!duplicate && processNow) void runOne(request.id)
              } catch (e) {
                setError(e instanceof SubmitError ? e.message : String(e))
              }
            }}
          >
            Submit
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-neutral-500">This simulates the upstream loader. It sends a pipeline key, an organisation ID and a submission reference. The active published version is assigned at submission.</p>
      <div className="space-y-3">
        <div>
          <Label hint={active ? `Assigns V${active.number}` : pipeline ? 'No published version' : 'Unknown key'}>Pipeline key</Label>
          <div className="flex gap-2">
            <Select value={pipelines.some((p) => p.key === key) ? key : ''} onChange={(e) => setKey(e.target.value)} className="w-56 shrink-0">
              <option value="">Custom key…</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.name}
                </option>
              ))}
            </Select>
            <TextInput value={key} onChange={(e) => setKey(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Organisation</Label>
            <Select
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value)
                setScenario(ORG_DEFAULT_SCENARIO[e.target.value] ?? 'well_supported')
              }}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.urn})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint="Unique per pipeline">Submission reference</Label>
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="rounded-[8px] border border-secondary-200 bg-secondary-50/50 p-3">
          <Label hint="Prototype only">Simulated model behaviour</Label>
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-neutral-500">{SCENARIOS.find((s) => s.id === scenario)?.description}</p>
        </div>
        <Toggle checked={processNow} onChange={setProcessNow} label="Process immediately and watch it run" />
        {error && <div className="rounded-[6px] border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700">{error}</div>}
      </div>
    </Modal>
  )
}
