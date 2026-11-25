import { CircleCheck, Info, Rocket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { access, useDb } from '../../data/store'
import type { PipelineVersion, Step } from '../../domain/types'
import { ConfigError, publishVersion } from '../../services/config'
import { DiffView } from '../../ui/DiffView'
import { VersionBadge } from '../../ui/domain'
import { Badge, Button, Card, Collapsible, Label, Modal, TextArea, TextInput, toast } from '../../ui/kit'
import { useVersion } from './context'
import { IssueList } from './VersionWorkspace'

const QUESTION_LABELS: Record<string, string> = {
  role: 'Model role',
  produce: 'Q1 What should the model produce?',
  audience: 'Q2 Who will use it?',
  background: 'Q3 Background',
  inclusion: 'Q5 What to include',
  evidenceRules: 'Q6 Evidence standard',
  uncertainty: 'Q7 Weak or irrelevant evidence',
  uncertaintyOutcome: 'Q7 Uncertainty outcome',
  writing: 'Q8 How the result should read',
  wordLimit: 'Q8 Word limit',
  examples: 'Q10 Examples',
  criteria: 'Criteria',
  seriousness: 'Seriousness',
  verdicts: 'Verdicts',
  confidenceGuidance: 'Confidence guidance',
}

const j = (v: unknown) => JSON.stringify(v)

function stepChanges(a: Step, b: Step): string[] {
  const out: string[] = []
  if (a.name !== b.name) out.push(`renamed “${a.name}” → “${b.name}”`)
  if (a.modelConfigId !== b.modelConfigId) out.push('model changed')
  if (j(a.settings) !== j(b.settings)) out.push('model settings changed')
  for (const k of Object.keys(QUESTION_LABELS)) if (j((a.prompt as unknown as Record<string, unknown>)[k]) !== j((b.prompt as unknown as Record<string, unknown>)[k])) out.push(`${QUESTION_LABELS[k]} edited`)
  if (j(a.bindings) !== j(b.bindings)) out.push('input bindings changed')
  if (j(a.outputSchema) !== j(b.outputSchema)) out.push('output fields changed')
  if (j(a.checks) !== j(b.checks)) out.push('check rules changed')
  if (j(a.rules) !== j(b.rules) || j(a.defaultRoute) !== j(b.defaultRoute)) out.push('routing changed')
  if (a.maxInvocations !== b.maxInvocations) out.push(`invocation limit ${a.maxInvocations ?? 'none'} → ${b.maxInvocations ?? 'none'}`)
  return out
}

export function describeChanges(from: PipelineVersion | undefined, to: PipelineVersion): { area: string; items: string[] }[] {
  if (!from) return [{ area: 'Version', items: ['First version of this pipeline'] }]
  const groups: { area: string; items: string[] }[] = []
  const settings: string[] = []
  if (from.maxRequestAttempts !== to.maxRequestAttempts) settings.push(`Maximum request attempts ${from.maxRequestAttempts} → ${to.maxRequestAttempts}`)
  if (from.exhaustionAction !== to.exhaustionAction) settings.push(`When attempts run out: ${from.exhaustionAction} → ${to.exhaustionAction}`)
  if (from.entryStepId !== to.entryStepId) settings.push('Entry step changed')
  if (from.resultStepId !== to.resultStepId) settings.push('Result step changed')
  if (settings.length) groups.push({ area: 'Run settings', items: settings })
  const inputs: string[] = []
  for (const i of to.inputs) {
    const old = from.inputs.find((x) => x.id === i.id)
    if (!old) inputs.push(`Added ${i.kind} input ${i.alias}${i.typeRef ? ` (${i.typeRef})` : ''}`)
    else if (j(old) !== j(i)) inputs.push(`Changed ${i.alias}`)
  }
  for (const i of from.inputs) if (!to.inputs.some((x) => x.id === i.id)) inputs.push(`Removed ${i.alias}`)
  if (inputs.length) groups.push({ area: 'Inputs', items: inputs })
  for (const s of to.steps) {
    const old = from.steps.find((x) => x.id === s.id)
    if (!old) groups.push({ area: s.name, items: ['New step'] })
    else {
      const c = stepChanges(old, s)
      if (c.length) groups.push({ area: s.name, items: c })
    }
  }
  for (const s of from.steps) if (!to.steps.some((x) => x.id === s.id)) groups.push({ area: s.name, items: ['Step removed'] })
  if (j(from.destination) !== j(to.destination)) groups.push({ area: 'Destination', items: ['Field mapping changed'] })
  return groups
}

export default function PublishTab() {
  const { version, pipeline, issues, readOnly } = useVersion()
  const active = useDb((db) => db.versions.find((v) => v.id === pipeline.activeVersionId))
  const queued = useDb((db) => db.requests.filter((r) => r.pipelineId === pipeline.id && ['queued', 'in_progress', 'retry_scheduled', 'awaiting_review'].includes(r.status)))
  const suiteRuns = useDb((db) => db.testRuns.filter((r) => r.versionId === version.id && r.testCaseId))
  const userId = useDb((db) => db.currentUserId)
  const currentUser = useDb((db) => db.users.find((u) => u.id === db.currentUserId))
  const navigate = useNavigate()
  const [approvedBy, setApprovedBy] = useState('')
  const [note, setNote] = useState(version.changeNote ?? '')
  const [confirm, setConfirm] = useState(false)
  const errors = issues.filter((i) => i.severity === 'error')
  const changes = useMemo(() => describeChanges(active, version), [active, version])
  const latestByCase = new Map<string, (typeof suiteRuns)[number]>()
  for (const r of [...suiteRuns].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))) latestByCase.set(r.testCaseId as string, r)
  const latest = [...latestByCase.values()]
  const passing = latest.filter((r) => r.status !== 'running' && r.assertionResults.every((a) => a.passed)).length

  if (readOnly) return <div className="p-6 text-sm text-neutral-500">This version is already published.</div>

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_360px] gap-5 p-6">
      <div className="space-y-4">
        <Card
          title={
            <span className="flex items-center gap-2">
              Changes from {active ? <VersionBadge version={active} active /> : 'nothing'} to <VersionBadge version={version} />
            </span>
          }
          subtitle="Draft-to-published comparison"
        >
          {changes.length === 0 ? (
            <div className="text-sm text-neutral-500">No changes from the published version.</div>
          ) : (
            <div className="space-y-3">
              {changes.map((g) => (
                <div key={g.area}>
                  <div className="text-sm font-semibold text-neutral-900">{g.area}</div>
                  <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
                    {g.items.map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary-400" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {active && (
            <Collapsible title="Full configuration diff" className="mt-4 border-t border-neutral-100 pt-3">
              <DiffView before={JSON.stringify(strip(active), null, 2)} after={JSON.stringify(strip(version), null, 2)} />
            </Collapsible>
          )}
        </Card>
        <Card title="Checks before publication">
          <IssueList issues={issues} />
        </Card>
        <Card title="Test results for this draft">
          {latest.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-warning-800">
              <Info className="size-4" /> No saved test cases have been run against this draft yet.
            </div>
          ) : (
            <div className="text-sm">
              <span className={passing === latest.length ? 'text-success-700' : 'text-warning-800'}>
                {passing} of {latest.length} saved cases passed on their latest run.
              </span>{' '}
              <Link to={`/pipelines/${pipeline.id}/versions/${version.id}/tests`} className="text-primary-700 hover:underline">
                Open tests
              </Link>
            </div>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Publish">
          <div className="space-y-3">
            <div>
              <Label required>Approved by</Label>
              <TextInput value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Name of the person who approved this version" />
              <p className="mt-1 text-xs text-neutral-500">Records the approver you name. This is the complete approval step for this prototype.</p>
            </div>
            <div>
              <Label>Change note</Label>
              <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
            <div className="text-xs text-neutral-500">
              Publisher: <strong>{currentUser?.name}</strong> (from “Acting as”)
            </div>
            <Button className="w-full" variant="solid" tone="primary" icon={<Rocket className="size-4" />} disabled={!approvedBy.trim() || errors.length > 0} onClick={() => setConfirm(true)}>
              Publish V{version.number}
            </Button>
            {errors.length > 0 && <p className="text-xs text-error-700">Resolve {errors.length} issue(s) first.</p>}
          </div>
        </Card>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Publish V${version.number}?`}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="solid"
              tone="primary"
              onClick={() => {
                try {
                  publishVersion(access, version.id, { approvedBy, changeNote: note, actorId: userId, at: new Date().toISOString() })
                  setConfirm(false)
                  toast(`V${version.number} published. New requests now receive V${version.number}.`)
                  navigate(`/pipelines/${pipeline.id}`)
                } catch (e) {
                  toast(e instanceof ConfigError ? e.message : String(e), 'error')
                }
              }}
            >
              Confirm and publish
            </Button>
          </>
        }
      >
        <div className="rounded-[8px] border border-info-200 bg-info-50 p-3 text-sm font-medium text-info-900">This version applies to new requests only. Queued and in-progress requests keep their original version.</div>
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          <li className="flex items-center gap-2">
            <CircleCheck className="size-4 text-success-600" /> Approved by <strong>{approvedBy}</strong>
          </li>
          {active && (
            <li className="flex items-center gap-2">
              <Badge>{queued.length}</Badge> unfinished request{queued.length === 1 ? '' : 's'} will stay on V{active.number}
            </li>
          )}
          <li className="text-xs text-neutral-500">The published configuration is frozen. Create a new draft to make further changes.</li>
        </ul>
      </Modal>
    </div>
  )
}

function strip(v: PipelineVersion) {
  const { id: _id, number: _n, state: _s, authorId: _a, createdAt: _c, updatedAt: _u, copiedFromVersionId: _cf, publishedById: _pb, publishedAt: _pa, approvedBy: _ab, changeNote: _cn, ...rest } = v
  return rest
}
