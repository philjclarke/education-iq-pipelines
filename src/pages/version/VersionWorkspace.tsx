import { AlertTriangle, CircleCheck, GitBranchPlus, Lock, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { access, useDb } from '../../data/store'
import { validateVersion, type ConfigIssue } from '../../engine/graph'
import { ConfigError, createDraftFrom, discardDraft } from '../../services/config'
import { UserName, VersionBadge } from '../../ui/domain'
import { Badge, Button, Card, cx, fmtAgo, fmtDate, Label, Modal, Select, TextArea, TextInput, toast } from '../../ui/kit'
import { makeEdit, useVersion, VersionContext } from './context'
import DestinationTab from './DestinationTab'
import InputsTab from './InputsTab'
import PublishTab from './PublishTab'
import StepsTab from './StepsTab'
import TestsTab from './TestsTab'

export default function VersionWorkspace() {
  const { pipelineId, versionId } = useParams()
  const pipeline = useDb((db) => db.pipelines.find((p) => p.id === pipelineId))
  const version = useDb((db) => db.versions.find((v) => v.id === versionId))
  const issues = useMemo(() => (version ? validateVersion(version) : []), [version])
  if (!pipeline || !version) return <div className="p-8">Version not found.</div>
  const base = `/pipelines/${pipeline.id}/versions/${version.id}`
  const ctx = { pipeline, version, readOnly: version.state !== 'draft', issues, edit: makeEdit(version.id), base }

  return (
    <VersionContext.Provider value={ctx}>
      <div className="flex min-h-full flex-col">
        <WorkspaceHeader />
        <div className="min-h-0 flex-1">
          <Routes>
            <Route index element={<OverviewTab />} />
            <Route path="inputs" element={<InputsTab />} />
            <Route path="steps" element={<StepsTab />} />
            <Route path="steps/:stepId" element={<StepsTab />} />
            <Route path="tests" element={<TestsTab />} />
            <Route path="tests/:runId" element={<TestsTab />} />
            <Route path="destination" element={<DestinationTab />} />
            <Route path="publish" element={<PublishTab />} />
          </Routes>
        </div>
      </div>
    </VersionContext.Provider>
  )
}

function WorkspaceHeader() {
  const { pipeline, version, readOnly, issues, base } = useVersion()
  const draft = useDb((db) => db.versions.find((v) => v.pipelineId === pipeline.id && v.state === 'draft'))
  const userId = useDb((db) => db.currentUserId)
  const source = useDb((db) => db.versions.find((v) => v.id === version.copiedFromVersionId))
  const navigate = useNavigate()
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const isActive = pipeline.activeVersionId === version.id
  const tabs = [
    { to: base, label: 'Overview', end: true },
    { to: `${base}/inputs`, label: 'Inputs', area: 'inputs' },
    { to: `${base}/steps`, label: 'Steps & prompts', area: 'steps' },
    { to: `${base}/tests`, label: 'Test' },
    { to: `${base}/destination`, label: 'Destination', area: 'destination' },
    ...(readOnly ? [] : [{ to: `${base}/publish`, label: 'Review & publish' }]),
  ]
  const areaHasError = (area?: string) =>
    !!area && issues.some((i) => i.severity === 'error' && (area === 'steps' ? !['inputs', 'destination', 'version'].includes(i.area) : i.area === area))

  return (
    <div className="border-b border-neutral-200 bg-white px-6 pt-4">
      <div className="text-xs text-neutral-500">
        <Link to="/pipelines" className="hover:underline">
          Pipelines
        </Link>{' '}
        /{' '}
        <Link to={`/pipelines/${pipeline.id}`} className="hover:underline">
          {pipeline.name}
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{pipeline.name}</h1>
          <VersionBadge version={version} active={isActive} />
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <Lock className="size-3.5" /> Published {fmtDate(version.publishedAt)} · frozen
              </span>
              {draft ? (
                <Link to={`/pipelines/${pipeline.id}/versions/${draft.id}`}>
                  <Button size="sm" variant="soft" tone="primary">
                    Open draft V{draft.number}
                  </Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant="solid"
                  tone="primary"
                  icon={<GitBranchPlus className="size-3.5" />}
                  onClick={() => {
                    try {
                      const id = createDraftFrom(access, version.id, userId, new Date().toISOString())
                      toast(`Draft created from V${version.number}`)
                      navigate(`/pipelines/${pipeline.id}/versions/${id}`)
                    } catch (e) {
                      toast(e instanceof ConfigError ? e.message : String(e), 'error')
                    }
                  }}
                >
                  Create draft from this version
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="text-xs text-neutral-500">
                Draft{source ? ` copied from V${source.number}` : ''} · saved {fmtAgo(version.updatedAt)}
              </span>
              <Link to={`${base}`}>
                {errors > 0 ? (
                  <Badge color="error">
                    <AlertTriangle className="size-3" />
                    {errors} to resolve
                  </Badge>
                ) : (
                  <Badge color="success">
                    <CircleCheck className="size-3" />
                    Ready to publish{warnings ? ` · ${warnings} warning${warnings > 1 ? 's' : ''}` : ''}
                  </Badge>
                )}
              </Link>
              <Link to={`${base}/publish`}>
                <Button size="sm" variant="solid" tone="primary">
                  Review & publish
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="mt-3 flex gap-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive: on }) =>
              cx('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium', on ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800')
            }
          >
            {t.label}
            {!readOnly && areaHasError((t as { area?: string }).area) && <span className="size-1.5 rounded-full bg-error-500" />}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function IssueList({ issues, compact }: { issues: ConfigIssue[]; compact?: boolean }) {
  const { base, version } = useVersion()
  if (!issues.length)
    return (
      <div className="flex items-center gap-2 text-sm text-success-700">
        <CircleCheck className="size-4" /> No problems found.
      </div>
    )
  return (
    <ul className={cx('space-y-1.5', compact && 'text-xs')}>
      {issues.map((i, n) => {
        const target = i.stepId ? `${base}/steps/${i.stepId}` : i.area === 'inputs' ? `${base}/inputs` : i.area === 'destination' ? `${base}/destination` : base
        return (
          <li key={n} className="flex items-start gap-2">
            <Badge color={i.severity === 'error' ? 'error' : 'warning'} className="mt-0.5">
              {i.severity === 'error' ? (i.blocksTest ? 'Blocks test' : 'Blocks publish') : 'Warning'}
            </Badge>
            <Link to={target} className="text-neutral-700 hover:text-primary-700 hover:underline">
              {i.message}
            </Link>
            {i.stepId && <span className="ml-auto shrink-0 text-xs text-neutral-400">{version.steps.find((s) => s.id === i.stepId)?.code}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function OverviewTab() {
  const { version, readOnly, edit, issues, pipeline } = useVersion()
  const navigate = useNavigate()
  const [discardOpen, setDiscardOpen] = useState(false)
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-3 gap-4 p-6">
      <div className="col-span-2 space-y-4">
        {!readOnly && (
          <Card title="Before testing or publishing" subtitle="Each item links to the step, field or rule that needs attention.">
            <IssueList issues={issues} />
          </Card>
        )}
        <Card title="Run settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label hint="Includes the initial attempt">Maximum request attempts</Label>
              <TextInput type="number" min={1} max={10} disabled={readOnly} value={version.maxRequestAttempts} onChange={(e) => edit((v) => void (v.maxRequestAttempts = Math.max(1, Number(e.target.value) || 1)))} />
              <p className="mt-1 text-xs text-neutral-500">The first run after input checks is attempt 1. Each retry or reviewer rerun is another attempt.</p>
            </div>
            <div>
              <Label>When attempts run out</Label>
              <Select disabled={readOnly} value={version.exhaustionAction} onChange={(e) => edit((v) => void (v.exhaustionAction = e.target.value as 'fail' | 'manual_review'))}>
                <option value="manual_review">Send to manual review</option>
                <option value="fail">Fail the request</option>
              </Select>
              <p className="mt-1 text-xs text-neutral-500">Also applies when a step reaches its own invocation limit.</p>
            </div>
            <div>
              <Label>Entry step</Label>
              <Select disabled={readOnly} value={version.entryStepId ?? ''} onChange={(e) => edit((v) => void (v.entryStepId = e.target.value || null))}>
                <option value="">Choose…</option>
                {version.steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Step that produces the result</Label>
              <Select disabled={readOnly} value={version.resultStepId ?? ''} onChange={(e) => edit((v) => void (v.resultStepId = e.target.value || null))}>
                <option value="">Choose…</option>
                {version.steps
                  .filter((s) => s.type === 'generate')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
              <p className="mt-1 text-xs text-neutral-500">Its output is the candidate for review and the saved result.</p>
            </div>
          </div>
        </Card>
        <Card title="Change note">
          <TextArea disabled={readOnly} value={version.changeNote ?? ''} onChange={(e) => edit((v) => void (v.changeNote = e.target.value))} placeholder="What changed in this version, and why?" />
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Version">
          <dl className="space-y-2 text-sm">
            <Row k="State">{version.state === 'draft' ? 'Draft (editable)' : 'Published (frozen)'}</Row>
            <Row k="Author">
              <UserName id={version.authorId} />
            </Row>
            <Row k="Created">{fmtDate(version.createdAt)}</Row>
            {version.publishedAt && (
              <>
                <Row k="Published">
                  {fmtDate(version.publishedAt)} by <UserName id={version.publishedById} />
                </Row>
                <Row k="Approved by">{version.approvedBy}</Row>
              </>
            )}
            <Row k="Steps">{version.steps.length}</Row>
            <Row k="Inputs">{version.inputs.length}</Row>
          </dl>
        </Card>
        {!readOnly && (
          <Card title="Discard draft">
            <p className="text-xs text-neutral-500">Removes this draft. Published versions are unaffected.</p>
            <Button className="mt-2" size="sm" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => setDiscardOpen(true)} disabled={!pipeline.activeVersionId}>
              Discard draft
            </Button>
          </Card>
        )}
      </div>
      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={`Discard draft V${version.number}?`}
        footer={
          <>
            <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
            <Button
              tone="error"
              variant="solid"
              onClick={() => {
                discardDraft(access, version.id)
                setDiscardOpen(false)
                toast(`Draft V${version.number} discarded`, 'info')
                navigate(`/pipelines/${pipeline.id}`)
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        Your edits to this draft will be lost. Test runs against it remain in the test history.
      </Modal>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right text-neutral-800">{children}</dd>
    </div>
  )
}
