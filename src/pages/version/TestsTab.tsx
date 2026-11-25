import { CircleCheck, CircleX, FlaskConical, Loader2, Pencil, Play, PlayCircle, Plus, Save, Trash2, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { randomCode } from '../../data/db'
import { access, useDb } from '../../data/store'
import type { Assertion, Comparator, StepExecution, TestCase, TestRun } from '../../domain/types'
import { SCENARIOS } from '../../engine/mockProvider'
import { ORG_DEFAULT_SCENARIO } from '../../seed/pipelines'
import { describeAssertion, runSuite, startTestRun } from '../../services/testing'
import { DiffView } from '../../ui/DiffView'
import { OrgName, SimulatedBadge } from '../../ui/domain'
import { Badge, Button, Card, cx, EmptyState, fmtAgo, fmtGBP, Label, Modal, Select, TextArea, TextInput, toast } from '../../ui/kit'
import { Trace } from '../../ui/Trace'
import { useVersion } from './context'

const RUN_STATUS: Record<TestRun['status'], { label: string; color: 'primary' | 'success' | 'error' | 'warning' | 'secondary' | 'neutral' }> = {
  running: { label: 'Running', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  awaiting_review: { label: 'Manual review', color: 'warning' },
  missing_input: { label: 'Missing input', color: 'secondary' },
  interrupted: { label: 'Interrupted', color: 'neutral' },
}

function RunStatus({ run }: { run: TestRun }) {
  const m = RUN_STATUS[run.status]
  return (
    <Badge color={m.color}>
      {run.status === 'running' && <Loader2 className="size-3 animate-spin" />}
      {m.label}
    </Badge>
  )
}

function AssertionSummary({ run }: { run: TestRun }) {
  if (!run.testCaseId || run.status === 'running') return null
  const passed = run.assertionResults.filter((a) => a.passed).length
  const all = run.assertionResults.length
  return passed === all ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700">
      <CircleCheck className="size-3.5" /> {passed}/{all}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-error-700">
      <CircleX className="size-3.5" /> {passed}/{all}
    </span>
  )
}

export default function TestsTab() {
  const { runId } = useParams()
  const { version, pipeline, issues, base } = useVersion()
  const cases = useDb((db) => db.testCases.filter((c) => c.pipelineId === pipeline.id))
  const runs = useDb((db) => db.testRuns.filter((r) => r.pipelineId === pipeline.id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)))
  const userId = useDb((db) => db.currentUserId)
  const navigate = useNavigate()
  const blocking = issues.filter((i) => i.severity === 'error' && i.blocksTest)
  const [caseModal, setCaseModal] = useState<TestCase | 'new' | null>(null)
  const [suiteId, setSuiteId] = useState<string | null>(null)
  const selected = runs.find((r) => r.id === runId)

  const runCase = (tc: TestCase) => {
    const { runId: id } = startTestRun(access, { versionId: version.id, testCaseId: tc.id, orgId: tc.orgId, manualInputs: tc.manualInputs, scenario: tc.scenario, label: tc.name, actorId: userId })
    navigate(`${base}/tests/${id}`)
  }

  return (
    <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-5 p-6">
      <div className="space-y-4">
        {blocking.length > 0 && (
          <div className="rounded-[8px] border border-error-200 bg-error-50 p-3 text-sm text-error-800">
            <div className="font-semibold">Fix {blocking.length} issue{blocking.length > 1 ? 's' : ''} before testing</div>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {blocking.slice(0, 4).map((i, n) => (
                <li key={n}>
                  <Link to={i.stepId ? `${base}/steps/${i.stepId}` : base} className="hover:underline">
                    {i.message}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SamplePanel disabled={blocking.length > 0} onSaveCase={(tc) => setCaseModal(tc)} />
        <Card
          title="Saved test cases"
          subtitle="Each case checks expected fields, outcomes and the route taken."
          actions={
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setCaseModal('new')}>
              New
            </Button>
          }
          padded={false}
        >
          <ul className="divide-y divide-neutral-100">
            {cases.map((tc) => {
              const last = runs.find((r) => r.testCaseId === tc.id && r.versionId === version.id)
              return (
                <li key={tc.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-900">{tc.name}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        <OrgName id={tc.orgId} /> · {SCENARIOS.find((s) => s.id === tc.scenario)?.label}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tc.assertions.map((a) => (
                          <span key={a.id} className="rounded bg-neutral-100 px-1 font-mono text-[10.5px] text-neutral-600">
                            {describeAssertion(a)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button size="sm" disabled={blocking.length > 0} icon={<Play className="size-3" />} onClick={() => runCase(tc)}>
                        Run
                      </Button>
                      {last && (
                        <Link to={`${base}/tests/${last.id}`} className="flex items-center gap-1">
                          {last.status === 'running' ? <RunStatus run={last} /> : <AssertionSummary run={last} />}
                        </Link>
                      )}
                      <button type="button" className="text-[11px] text-neutral-400 hover:text-neutral-700" onClick={() => setCaseModal(tc)}>
                        <Pencil className="inline size-3" /> edit
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-neutral-200 p-3">
            <Button
              className="w-full"
              variant="solid"
              tone="primary"
              disabled={blocking.length > 0 || cases.length === 0}
              icon={<PlayCircle className="size-4" />}
              onClick={() => {
                const { suiteRunId } = runSuite(access, version.id, cases, userId)
                setSuiteId(suiteRunId)
                navigate(`${base}/tests`)
              }}
            >
              Run test suite ({cases.length})
            </Button>
          </div>
        </Card>
      </div>
      <div className="min-w-0">
        {selected ? (
          <RunView run={selected} />
        ) : (
          <>
            <SuiteView suiteId={suiteId ?? runs.find((r) => r.suiteRunId)?.suiteRunId ?? null} />
            <RunHistory runs={runs} />
          </>
        )}
      </div>
      <CaseModal value={caseModal} onClose={() => setCaseModal(null)} />
    </div>
  )
}

function SamplePanel({ disabled, onSaveCase }: { disabled: boolean; onSaveCase: (tc: TestCase) => void }) {
  const { version, pipeline, base } = useVersion()
  const orgs = useDb((db) => db.orgs)
  const userId = useDb((db) => db.currentUserId)
  const navigate = useNavigate()
  const [orgId, setOrgId] = useState<string>('org-harbour')
  const [scenario, setScenario] = useState('worked_example')
  const [manual, setManual] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <Card title="Run sample" subtitle="Use seeded input records or enter test values.">
      <div className="space-y-3">
        <div className="inline-flex overflow-hidden rounded-[6px] text-xs ring-1 ring-neutral-300">
          {[false, true].map((m) => (
            <button key={String(m)} type="button" onClick={() => setManual(m)} className={cx('px-2.5 py-1 font-medium', manual === m ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600')}>
              {m ? 'Enter values' : 'Seeded records'}
            </button>
          ))}
        </div>
        {!manual ? (
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
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            {version.inputs
              .filter((i) => i.kind === 'dynamic')
              .map((i) => (
                <div key={i.id}>
                  <Label hint={i.required ? 'required' : 'optional'}>{i.alias}</Label>
                  <TextArea rows={3} value={values[i.alias] ?? ''} onChange={(e) => setValues({ ...values, [i.alias]: e.target.value })} placeholder="Separate excerpts with a blank line" />
                </div>
              ))}
          </div>
        )}
        <div>
          <Label hint="Prototype only">Simulated model behaviour</Label>
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] text-neutral-500">{SCENARIOS.find((s) => s.id === scenario)?.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="solid"
            tone="primary"
            disabled={disabled}
            icon={<Play className="size-3.5" />}
            onClick={() => {
              const org = manual ? null : orgId
              const { runId } = startTestRun(access, { versionId: version.id, orgId: org, manualInputs: manual ? values : {}, scenario, label: manual ? 'Sample · manual values' : `Sample · ${orgs.find((o) => o.id === orgId)?.name}`, actorId: userId })
              navigate(`${base}/tests/${runId}`)
            }}
          >
            Run sample
          </Button>
          <Button
            icon={<Save className="size-3.5" />}
            onClick={() =>
              onSaveCase({
                id: '',
                pipelineId: pipeline.id,
                name: '',
                description: '',
                orgId: manual ? null : orgId,
                manualInputs: manual ? values : {},
                scenario,
                assertions: [{ id: `a-${randomCode(4)}`, kind: 'route', expected: 'complete' }],
                createdAt: new Date().toISOString(),
              })
            }
          >
            Save as case
          </Button>
        </div>
      </div>
    </Card>
  )
}

function RunHistory({ runs }: { runs: TestRun[] }) {
  const { base, version } = useVersion()
  const shown = runs.slice(0, 25)
  return (
    <Card title="Test history" subtitle="Test runs are kept separate from production requests, results and destinations." padded={false} className="mt-4">
      {shown.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No test runs yet" icon={<FlaskConical className="size-6" />}>
            Run a sample or the saved suite. The trace updates live as each simulated step starts and finishes.
          </EmptyState>
        </div>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <Link to={`${base}/tests/${r.id}`} className="font-mono text-xs text-primary-700 hover:underline">
                    {r.id}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2">
                  <Badge color={r.versionId === version.id ? 'primary' : 'neutral'}>V{r.versionNumber}</Badge>
                </td>
                <td className="px-4 py-2">
                  <RunStatus run={r} />
                </td>
                <td className="px-4 py-2">
                  <AssertionSummary run={r} />
                </td>
                <td className="px-4 py-2 text-right text-xs text-neutral-500">{fmtAgo(r.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function SuiteView({ suiteId }: { suiteId: string | null }) {
  const { base } = useVersion()
  const runs = useDb((db) => db.testRuns.filter((r) => r.suiteRunId === suiteId))
  if (!suiteId || !runs.length) return null
  const done = runs.filter((r) => r.status !== 'running')
  const passed = done.filter((r) => r.assertionResults.every((a) => a.passed)).length
  const running = runs.length - done.length
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Test suite {running > 0 && <Loader2 className="size-4 animate-spin text-primary-600" />}
        </span>
      }
      subtitle={`V${runs[0].versionNumber} · pinned when the suite started · ${running ? `${running} running` : `${passed} of ${runs.length} cases passed`}`}
      actions={<SimulatedBadge>Simulated · {fmtGBP(runs.reduce((n, r) => n + r.simulatedCostGBP, 0))}</SimulatedBadge>}
      padded={false}
    >
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Case</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Expected vs actual</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 font-medium">{r.label}</td>
              <td className="px-4 py-2.5">
                <RunStatus run={r} />
              </td>
              <td className="px-4 py-2.5">
                {r.status === 'running' ? (
                  <span className="text-xs text-neutral-400">running…</span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.assertionResults.map((a) => (
                      <li key={a.assertionId} className={cx('flex items-center gap-1.5 text-xs', a.passed ? 'text-neutral-600' : 'font-medium text-error-700')}>
                        {a.passed ? <CircleCheck className="size-3.5 text-success-600" /> : <CircleX className="size-3.5" />}
                        {a.label}
                        {!a.passed && <span className="font-normal text-error-600">· got {a.actual}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link to={`${base}/tests/${r.id}`}>
                  <Button size="sm">Open trace</Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function RunView({ run }: { run: TestRun }) {
  const { version, base, readOnly } = useVersion()
  const attempts = useDb((db) => db.testAttempts.filter((a) => a.ownerId === run.id))
  const executions = useDb((db) => db.testExecutions.filter((e) => e.ownerId === run.id))
  const allRuns = useDb((db) => db.testRuns)
  const allExecs = useDb((db) => db.testExecutions)
  const userId = useDb((db) => db.currentUserId)
  const testCase = useDb((db) => db.testCases.find((t) => t.id === run.testCaseId))
  const navigate = useNavigate()
  const pinned = run.pinnedConfig
  const stale = useMemo(() => JSON.stringify({ ...pinned, updatedAt: 0 }) !== JSON.stringify({ ...version, updatedAt: 0 }), [pinned, version])
  const previous = allRuns
    .filter((r) => r.id !== run.id && r.startedAt < run.startedAt && r.status !== 'running' && (run.testCaseId ? r.testCaseId === run.testCaseId : r.orgId === run.orgId && r.scenario === run.scenario))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0]
  const resultStep = pinned.steps.find((s) => s.id === pinned.resultStepId)
  const lastResult = [...executions].reverse().find((e) => e.stepId === pinned.resultStepId && e.structured)
  const findings = executions.filter((e) => e.stepType === 'validate' && Array.isArray(e.structured?.findings)).flatMap((e) => (e.structured?.findings as Record<string, unknown>[]).map((f): Record<string, unknown> => ({ ...f, step: e.stepName })))
  const failedAssertions = run.assertionResults.filter((a) => !a.passed)

  const rerun = () => {
    const { runId } = startTestRun(access, { versionId: version.id, testCaseId: run.testCaseId ?? undefined, orgId: run.orgId, manualInputs: testCase?.manualInputs ?? {}, scenario: run.scenario, label: run.label, actorId: userId })
    navigate(`${base}/tests/${runId}`)
  }

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link to={`${base}/tests`} className="text-xs text-neutral-500 hover:underline">
                Test
              </Link>
              <span className="text-xs text-neutral-300">/</span>
              <span className="font-mono text-xs text-neutral-500">{run.id}</span>
            </div>
            <h2 className="mt-0.5 text-lg font-semibold">{run.label}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <RunStatus run={run} />
              <Badge color="primary">V{run.versionNumber} pinned at start</Badge>
              <SimulatedBadge>Simulated run · {fmtGBP(run.simulatedCostGBP)}</SimulatedBadge>
              <span>
                <OrgName id={run.orgId} /> · {SCENARIOS.find((s) => s.id === run.scenario)?.label}
              </span>
              <span>· started {fmtAgo(run.startedAt)}</span>
            </div>
            {run.finalReason && <div className="mt-2 text-sm text-neutral-700">{run.finalReason}</div>}
          </div>
          <div className="flex gap-2">
            <Button icon={<Play className="size-3.5" />} variant={stale ? 'solid' : 'outline'} tone={stale ? 'primary' : 'neutral'} onClick={rerun} disabled={run.status === 'running'}>
              {stale ? 'Rerun with current draft' : 'Rerun'}
            </Button>
          </div>
        </div>
        {stale && run.versionId === version.id && !readOnly && <div className="mt-3 rounded-[6px] bg-warning-50 px-3 py-2 text-xs text-warning-800">The draft has changed since this run started. This trace used the pinned copy.</div>}
      </div>

      {run.testCaseId && run.status !== 'running' && (
        <Card title="Assertions" subtitle={testCase?.description}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="pb-1 font-medium">Check</th>
                <th className="pb-1 font-medium">Expected</th>
                <th className="pb-1 font-medium">Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {run.assertionResults.map((a) => (
                <tr key={a.assertionId} className={cx(!a.passed && 'bg-error-50/50')}>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      {a.passed ? <CircleCheck className="size-4 text-success-600" /> : <CircleX className="size-4 text-error-600" />}
                      {a.label}
                    </span>
                  </td>
                  <td className="py-1.5 font-mono text-xs">{a.expected}</td>
                  <td className={cx('py-1.5 font-mono text-xs', !a.passed && 'font-semibold text-error-700')}>{a.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(failedAssertions.length > 0 || findings.some((f) => f.severity !== 'minor')) && run.status !== 'running' && resultStep && (
        <Card title={<span className="flex items-center gap-2"><Wrench className="size-4 text-neutral-500" /> Fix it in the editor</span>} subtitle="Inspect the candidate, the evidence and the findings, then edit the instruction that caused the problem.">
          <div className="space-y-3">
            {findings
              .filter((f) => f.severity !== 'minor')
              .map((f, i) => (
                <div key={i} className="rounded-[6px] border border-neutral-200 p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge color={f.severity === 'material' ? 'error' : 'warning'}>{String(f.severity)}</Badge>
                    <span className="font-medium">{String(f.criterion)}</span>
                    <span className="text-xs text-neutral-400">from {String(f.step)}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-700">“{String(f.claim)}”</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{String(f.explanation)}</div>
                </div>
              ))}
            <div className="flex flex-wrap gap-2">
              {!readOnly && (
                <>
                  <Link to={`${base}/steps/${resultStep.id}#q-evidenceRules`}>
                    <Button size="sm" variant="soft" tone="primary">
                      Open evidence instructions (Q6)
                    </Button>
                  </Link>
                  <Link to={`${base}/steps/${resultStep.id}#q-inclusion`}>
                    <Button size="sm">Open inclusion rules (Q5)</Button>
                  </Link>
                  {pinned.steps
                    .filter((s) => s.type === 'validate')
                    .map((s) => (
                      <Link key={s.id} to={`${base}/steps/${s.id}#q-routing`}>
                        <Button size="sm">Routing for {s.name}</Button>
                      </Link>
                    ))}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {lastResult?.structured && (
        <Card title="Structured result" subtitle={`${resultStep?.name} · latest output`}>
          <ResultSummary structured={lastResult.structured} />
        </Card>
      )}

      {previous && run.status !== 'running' && <Comparison run={run} previous={previous} executions={executions} previousExecutions={allExecs.filter((e) => e.ownerId === previous.id)} />}

      <Card title="Trace" subtitle="Each step updates live. Expand a step for its inputs, rendered prompt, raw response, structured result, timing and simulated cost." actions={run.status === 'running' ? <span className="flex items-center gap-1.5 text-xs text-primary-700"><span className="live-dot size-2 rounded-full bg-primary-500" /> Live</span> : null}>
        {run.status === 'missing_input' ? (
          <div className="rounded-[6px] bg-secondary-50 px-3 py-2 text-sm text-secondary-800">Stopped before any model call: {run.finalReason}</div>
        ) : attempts.length === 0 && run.status === 'running' ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" /> Capturing inputs…
          </div>
        ) : (
          <Trace attempts={attempts} executions={executions} version={pinned} simulated />
        )}
      </Card>
    </div>
  )
}

export function ResultSummary({ structured, compact }: { structured: Record<string, unknown>; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {typeof structured.summary === 'string' && structured.summary && <p className={cx('leading-relaxed text-neutral-800', compact ? 'text-sm' : 'text-[15px]')}>{structured.summary}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(structured)
          .filter(([k]) => k !== 'summary')
          .map(([k, v]) => (
            <span key={k} className="rounded-[5px] bg-neutral-100 px-1.5 py-0.5">
              <span className="text-neutral-500">{k}:</span> <span className="font-mono text-neutral-800">{Array.isArray(v) ? v.join(', ') || '[]' : String(v)}</span>
            </span>
          ))}
      </div>
    </div>
  )
}

function routeOf(r: TestRun) {
  return RUN_STATUS[r.status].label
}

function Comparison({ run, previous, executions, previousExecutions }: { run: TestRun; previous: TestRun; executions: StepExecution[]; previousExecutions: StepExecution[] }) {
  const resultCode = run.pinnedConfig.steps.find((s) => s.id === run.pinnedConfig.resultStepId)?.code
  const last = (ex: StepExecution[], code?: string) => [...ex].reverse().find((e) => e.stepCode === code && e.structured)
  const now = last(executions, resultCode)
  const before = last(previousExecutions, resultCode)
  const path = (ex: StepExecution[]) => ex.filter((e) => e.status !== 'reused').map((e) => e.stepCode).join(' → ')
  const promptChanges = run.pinnedConfig.steps
    .filter((s) => s.type !== 'check')
    .map((s) => {
      const a = previousExecutions.find((e) => e.stepId === s.id && e.renderedPrompt)?.renderedPrompt?.system
      const b = executions.find((e) => e.stepId === s.id && e.renderedPrompt)?.renderedPrompt?.system
      return { s, a, b }
    })
    .filter((x) => x.a && x.b && x.a !== x.b)
  const verdicts = (ex: StepExecution[]) =>
    ex
      .filter((e) => e.stepType === 'validate' && e.structured)
      .map((e) => `${e.stepCode}: ${e.structured?.verdict}${typeof e.structured?.confidence === 'number' ? ` (${e.structured?.confidence})` : ''}`)
      .join(' · ')
  return (
    <Card title="Compared with the previous run" subtitle={`${previous.id} · V${previous.versionNumber} · ${fmtAgo(previous.startedAt)}`}>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            <th className="w-32 pb-1 font-medium" />
            <th className="pb-1 font-medium">Previous ({previous.id})</th>
            <th className="pb-1 font-medium">This run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 align-top">
          <Row label="Final route" a={routeOf(previous)} b={routeOf(run)} />
          <Row label="Path" a={path(previousExecutions)} b={path(executions)} mono />
          <Row label="Validator verdicts" a={verdicts(previousExecutions) || '—'} b={verdicts(executions) || '—'} mono />
          <Row label="Output" a={String(before?.structured?.summary ?? JSON.stringify(before?.structured ?? '—'))} b={String(now?.structured?.summary ?? JSON.stringify(now?.structured ?? '—'))} />
        </tbody>
      </table>
      {promptChanges.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-neutral-500">Prompt changes since the previous run</div>
          {promptChanges.map(({ s, a, b }) => (
            <div key={s.id}>
              <div className="mb-1 text-xs font-medium">{s.name}</div>
              <DiffView before={a as string} after={b as string} maxH="max-h-48" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-xs text-neutral-500">The rendered prompts are identical to the previous run.</div>
      )}
    </Card>
  )
}

function Row({ label, a, b, mono }: { label: string; a: string; b: string; mono?: boolean }) {
  const changed = a !== b
  return (
    <tr>
      <td className="py-1.5 pr-3 text-xs text-neutral-500">{label}</td>
      <td className={cx('py-1.5 pr-3 text-xs text-neutral-600', mono && 'font-mono')}>{a}</td>
      <td className={cx('py-1.5 text-xs', mono && 'font-mono', changed ? 'font-medium text-primary-800' : 'text-neutral-600')}>
        {b}
        {changed && <Badge color="primary" className="ml-1.5">changed</Badge>}
      </td>
    </tr>
  )
}

function CaseModal({ value, onClose }: { value: TestCase | 'new' | null; onClose: () => void }) {
  const { pipeline, version } = useVersion()
  const orgs = useDb((db) => db.orgs)
  const [draft, setDraft] = useState<TestCase | null>(null)
  const open = value !== null
  const current: TestCase | null =
    draft ??
    (value === 'new'
      ? { id: '', pipelineId: pipeline.id, name: '', description: '', orgId: 'org-millbrook', manualInputs: {}, scenario: 'well_supported', assertions: [{ id: `a-${randomCode(4)}`, kind: 'route', expected: 'complete' }], createdAt: new Date().toISOString() }
      : value)
  if (!open || !current) return null
  const set = (patch: Partial<TestCase>) => setDraft({ ...current, ...patch })
  const setA = (i: number, a: Assertion) => set({ assertions: current.assertions.map((x, j) => (j === i ? a : x)) })
  const close = () => {
    setDraft(null)
    onClose()
  }
  const codes = version.steps.map((s) => s.code)
  return (
    <Modal
      open
      onClose={close}
      width="max-w-2xl"
      title={current.id ? 'Edit test case' : 'Save test case'}
      footer={
        <>
          {current.id && (
            <Button
              tone="error"
              variant="ghost"
              className="mr-auto"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                access.mutate((d) => void (d.testCases = d.testCases.filter((t) => t.id !== current.id)))
                close()
              }}
            >
              Delete
            </Button>
          )}
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="solid"
            tone="primary"
            disabled={!current.name.trim()}
            onClick={() => {
              access.mutate((d) => {
                if (current.id) d.testCases = d.testCases.map((t) => (t.id === current.id ? current : t))
                else d.testCases.push({ ...current, id: `tc-${randomCode(6).toLowerCase()}` })
              })
              toast('Test case saved')
              close()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>Name</Label>
            <TextInput value={current.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>Organisation</Label>
            <Select value={current.orgId ?? ''} onChange={(e) => set({ orgId: e.target.value || null })}>
              <option value="">Manual values</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <TextInput value={current.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div>
          <Label hint="Prototype only">Simulated model behaviour</Label>
          <Select value={current.scenario} onChange={(e) => set({ scenario: e.target.value })}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Assertions</Label>
          <div className="space-y-1.5">
            {current.assertions.map((a, i) => (
              <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                <Select
                  className="w-36"
                  value={a.kind}
                  onChange={(e) => {
                    const k = e.target.value
                    const id = a.id
                    setA(i, k === 'route' ? { id, kind: 'route', expected: 'complete' } : k === 'outcome' ? { id, kind: 'outcome', stepCode: codes[0], expected: 'success' } : k === 'field' ? { id, kind: 'field', stepCode: codes[0], field: '', cmp: '=', value: '' } : { id, kind: 'attempts', cmp: '=', value: 1 })
                  }}
                >
                  <option value="route">Route</option>
                  <option value="outcome">Step outcome</option>
                  <option value="field">Field value</option>
                  <option value="attempts">Attempts</option>
                </Select>
                {a.kind === 'route' && (
                  <Select className="w-48" value={a.expected} onChange={(e) => setA(i, { ...a, expected: e.target.value as typeof a.expected })}>
                    <option value="complete">ends in Complete</option>
                    <option value="manual_review">ends in Manual review</option>
                    <option value="fail">ends in Fail</option>
                    <option value="missing_input">stops as Missing input</option>
                  </Select>
                )}
                {(a.kind === 'outcome' || a.kind === 'field') && (
                  <Select className="w-44" value={a.stepCode} onChange={(e) => setA(i, { ...a, stepCode: e.target.value })}>
                    {codes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                )}
                {a.kind === 'outcome' && (
                  <Select className="w-48" value={a.expected} onChange={(e) => setA(i, { ...a, expected: e.target.value as typeof a.expected })}>
                    {['success', 'invalid_output', 'provider_error', 'timeout', 'insufficient_evidence', 'check_failed'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                )}
                {a.kind === 'field' && (
                  <>
                    <TextInput className="w-32 font-mono text-xs" placeholder="field" value={a.field} onChange={(e) => setA(i, { ...a, field: e.target.value })} />
                    <Select className="w-20" value={a.cmp} onChange={(e) => setA(i, { ...a, cmp: e.target.value as Comparator })}>
                      {['=', '!=', '>', '>=', '<', '<=', 'contains'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                    <TextInput className="w-32" value={String(a.value ?? '')} onChange={(e) => setA(i, { ...a, value: isNaN(Number(e.target.value)) || e.target.value === '' ? e.target.value : Number(e.target.value) })} />
                  </>
                )}
                {a.kind === 'attempts' && (
                  <>
                    <Select className="w-20" value={a.cmp} onChange={(e) => setA(i, { ...a, cmp: e.target.value as '=' })}>
                      {['=', '<=', '>='].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                    <TextInput className="w-20" type="number" value={a.value} onChange={(e) => setA(i, { ...a, value: Number(e.target.value) })} />
                  </>
                )}
                <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => set({ assertions: current.assertions.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => set({ assertions: [...current.assertions, { id: `a-${randomCode(4)}`, kind: 'route', expected: 'complete' }] })}>
              Add assertion
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
