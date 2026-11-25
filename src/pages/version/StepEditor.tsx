import { AlertTriangle, ChevronDown, ChevronRight, Lightbulb, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { randomCode } from '../../data/db'
import { useDb } from '../../data/store'
import type { CheckConfig, OutputField, PromptExample, Step } from '../../domain/types'
import { routeStep } from '../../engine/routing'
import { ActionBadge, STEP_TYPE_LABEL, StepTypeIcon } from '../../ui/domain'
import { Badge, Button, cx, Label, Select, TextArea, TextInput } from '../../ui/kit'
import { BindingsEditor } from './BindingsEditor'
import { useVersion } from './context'
import { CRITERION_INSTRUCTIONS, GENERATION_QUESTIONS, ROLE_EXAMPLES, VALIDATION_QUESTIONS, type GuidedQuestion } from './guided'
import { PromptPreview, useSample, type SampleChoice } from './PromptPreview'
import { RoutingEditor } from './RoutingEditor'
import { SchemaEditor } from './SchemaEditor'

export function StepEditor({ step }: { step: Step }) {
  const { version, readOnly, edit, pipeline, issues, base } = useVersion()
  const models = useDb((db) => db.models)
  const navigate = useNavigate()
  const [choice, setChoice] = useState<SampleChoice>({ orgId: 'org-harbour', manualInputs: {}, label: 'org:org-harbour' })
  const { resolved } = useSample(version, step, choice)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const setStep = (fn: (s: Step) => void) =>
    edit((v) => {
      const s = v.steps.find((x) => x.id === step.id)
      if (s) fn(s)
    })
  const kind = pipeline.taskKind
  const stepIssues = issues.filter((i) => i.stepId === step.id)
  const model = models.find((m) => m.id === step.modelConfigId)

  const isOpen = (key: string, def: boolean) => open[key] ?? def
  const toggle = (key: string, def: boolean) => setOpen((o) => ({ ...o, [key]: !(o[key] ?? def) }))
  const jump = (key: string) => {
    const target = key === 'materials' && step.type === 'validate' ? 'candidate' : key === 'confidence' ? 'verdicts' : key
    setOpen((o) => ({ ...o, [target]: true }))
    setTimeout(() => {
      const el = document.getElementById(`q-${target}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el?.animate([{ boxShadow: '0 0 0 3px var(--color-primary-300)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600 })
    }, 60)
  }
  const location = useLocation()
  useEffect(() => {
    if (location.hash.startsWith('#q-')) jump(location.hash.slice(3))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash])

  const renderQ = (q: GuidedQuestion, answered: boolean, children: ReactNode) => {
    const def = !answered || !!q.required
    const ex = q.examples?.[kind] ?? q.examples?.evidence_summary
    return (
      <Section
        id={q.key}
        number={q.number}
        title={q.title}
        status={answered ? 'answered' : q.required ? 'required' : q.recommended ? 'recommended' : 'optional'}
        open={isOpen(q.key, def)}
        onToggle={() => toggle(q.key, def)}
        help={q.help}
        hasIssue={stepIssues.some((i) => i.severity === 'error' && i.message.includes(q.title))}
        example={
          ex && !readOnly ? (
            <ExampleBox
              text={Array.isArray(ex) ? ex.map((e) => `• ${e}`).join('\n') : ex}
              onUse={() =>
                setStep((s) => {
                  const p = s.prompt as unknown as Record<string, unknown>
                  if (q.key === 'criteria' && Array.isArray(ex)) {
                    for (const name of ex) if (!s.prompt.criteria.some((c) => c.name === name)) s.prompt.criteria.push({ id: `cr-${randomCode(5)}`, name, instructions: CRITERION_INSTRUCTIONS[name] ?? '' })
                  } else if (Array.isArray(ex)) {
                    const cur = (p[q.key] as string[]) ?? []
                    p[q.key] = [...cur, ...ex.filter((e) => !cur.includes(e))]
                  } else if (q.key === 'uncertainty') {
                    s.prompt.uncertainty = ex
                    s.prompt.uncertaintyOutcome = s.prompt.uncertaintyOutcome || 'insufficient_evidence'
                  } else p[q.key] = ex
                })
              }
            />
          ) : null
        }
      >
        {children}
      </Section>
    )
  }

  return (
    <div className={cx('grid gap-5', step.type === 'check' ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_minmax(380px,42%)]')}>
      <div className="min-w-0 space-y-3">
        {/* Header */}
        <div className="surface p-4">
          <div className="flex items-start gap-3">
            <StepTypeIcon type={step.type} className="size-9" />
            <div className="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,200px)] gap-3">
              <div>
                <Label>Step name</Label>
                <TextInput disabled={readOnly} value={step.name} onChange={(e) => setStep((s) => void (s.name = e.target.value))} className="font-medium" />
              </div>
              <div>
                <Label hint="Unique in this version">Code</Label>
                <TextInput disabled={readOnly} value={step.code} onChange={(e) => setStep((s) => void (s.code = e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase()))} className="font-mono text-xs" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge color={step.type === 'generate' ? 'primary' : step.type === 'validate' ? 'secondary' : 'neutral'}>{STEP_TYPE_LABEL[step.type]}</Badge>
            {version.entryStepId === step.id && <Badge color="success">Entry step</Badge>}
            {version.resultStepId === step.id && <Badge color="info">Produces the result</Badge>}
            {!readOnly && version.entryStepId !== step.id && (
              <button type="button" className="text-primary-700 hover:underline" onClick={() => edit((v) => void (v.entryStepId = step.id))}>
                Make entry step
              </button>
            )}
          </div>
          {step.type !== 'check' && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 2xl:grid-cols-4">
              <div className="col-span-2">
                <Label hint={step.type === 'validate' ? 'Can differ from the generator' : undefined}>Provider and model</Label>
                <Select disabled={readOnly} value={step.modelConfigId ?? ''} onChange={(e) => setStep((s) => void (s.modelConfigId = e.target.value || null))}>
                  <option value="">Choose a model…</option>
                  {['OpenAI', 'Azure OpenAI', 'Anthropic', 'Google'].map((p) => (
                    <optgroup key={p} label={p}>
                      {models
                        .filter((m) => m.provider === p)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Temperature</Label>
                <TextInput disabled={readOnly || !model?.supportsTemperature} type="number" step={0.1} min={0} max={2} value={step.settings.temperature} onChange={(e) => setStep((s) => void (s.settings.temperature = Number(e.target.value)))} />
              </div>
              <div>
                <Label>Max output tokens</Label>
                <TextInput disabled={readOnly} type="number" step={100} value={step.settings.maxOutputTokens} onChange={(e) => setStep((s) => void (s.settings.maxOutputTokens = Number(e.target.value)))} />
              </div>
              {model?.supportsReasoningEffort && (
                <div>
                  <Label>Reasoning effort</Label>
                  <Select disabled={readOnly} value={step.settings.reasoningEffort ?? 'medium'} onChange={(e) => setStep((s) => void (s.settings.reasoningEffort = e.target.value as 'low' | 'medium' | 'high'))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </div>
              )}
            </div>
          )}
          {stepIssues.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-[6px] bg-error-50/60 p-2.5 text-xs">
              {stepIssues.map((i, n) => (
                <li key={n} className={cx('flex items-start gap-1.5', i.severity === 'error' ? 'text-error-800' : 'text-warning-800')}>
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <button type="button" className="text-left hover:underline" onClick={() => jump(i.area === 'routing' ? 'routing' : i.area === 'schema' ? (step.type === 'validate' ? 'verdicts' : 'output') : i.area === 'bindings' ? (step.type === 'validate' ? 'candidate' : 'materials') : i.area === 'checks' ? 'checks' : 'produce')}>
                    {i.message.replace(`${step.name}: `, '').replace(`${step.name} · `, '')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {step.type !== 'check' && (
          <Section
            id="role"
            title="Model role"
            status={step.prompt.role.trim() ? 'answered' : 'optional'}
            open={isOpen('role', !step.prompt.role.trim())}
            onToggle={() => toggle('role', !step.prompt.role.trim())}
            help="One or two sentences that set who the model is acting as. Rendered first."
            example={!readOnly ? <ExampleBox text={ROLE_EXAMPLES[step.type]} onUse={() => setStep((s) => void (s.prompt.role = ROLE_EXAMPLES[step.type]))} /> : null}
          >
            <TextArea disabled={readOnly} rows={2} value={step.prompt.role} onChange={(e) => setStep((s) => void (s.prompt.role = e.target.value))} />
          </Section>
        )}

        {step.type === 'generate' && (
          <>
            {renderQ(GENERATION_QUESTIONS[0], !!step.prompt.produce.trim(), <>
              <TextArea disabled={readOnly} value={step.prompt.produce} onChange={(e) => setStep((s) => void (s.prompt.produce = e.target.value))} />
            </>)}
            {renderQ(GENERATION_QUESTIONS[1], !!step.prompt.audience.trim(), <>
              <TextArea disabled={readOnly} value={step.prompt.audience} onChange={(e) => setStep((s) => void (s.prompt.audience = e.target.value))} />
            </>)}
            {renderQ(GENERATION_QUESTIONS[2], !!step.prompt.background.trim(), <>
              <TextArea disabled={readOnly} rows={5} value={step.prompt.background} onChange={(e) => setStep((s) => void (s.prompt.background = e.target.value))} />
              {!readOnly && version.inputs.some((i) => i.kind === 'fixed') && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                  Insert fixed input:
                  {version.inputs
                    .filter((i) => i.kind === 'fixed')
                    .map((i) => (
                      <button key={i.id} type="button" className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 hover:bg-primary-50 hover:text-primary-700" onClick={() => setStep((s) => void (s.prompt.background = `${s.prompt.background}${s.prompt.background.endsWith('\n') || !s.prompt.background ? '' : '\n'}{{${i.alias}}}`))}>
                        {`{{${i.alias}}}`}
                      </button>
                    ))}
                </div>
              )}
            </>)}
            {renderQ(GENERATION_QUESTIONS[3], step.bindings.some((b) => b.role === 'material'), <>
              <BindingsEditor step={step} roles={['material', 'context']} defaultRole="material" sample={resolved} onChange={(b) => setStep((s) => void (s.bindings = b))} emptyText="Bind at least one input as material, e.g. inspection_evidence." />
            </>)}
            {renderQ(GENERATION_QUESTIONS[4], step.prompt.inclusion.length > 0, <>
              <ListEditor items={step.prompt.inclusion} onChange={(l) => setStep((s) => void (s.prompt.inclusion = l))} placeholder="An instruction you would give a new analyst" />
            </>)}
            {renderQ(GENERATION_QUESTIONS[5], step.prompt.evidenceRules.length > 0, <>
              <ListEditor items={step.prompt.evidenceRules} onChange={(l) => setStep((s) => void (s.prompt.evidenceRules = l))} placeholder="An evidence rule" />
            </>)}
            {renderQ(GENERATION_QUESTIONS[6], !!step.prompt.uncertainty.trim(), <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-neutral-500">Outcome value the model returns:</span>
                <Select disabled={readOnly} className="w-64" value={step.prompt.uncertaintyOutcome} onChange={(e) => setStep((s) => void (s.prompt.uncertaintyOutcome = e.target.value))}>
                  <option value="">None</option>
                  {(step.outputSchema.find((f) => f.name === 'outcome')?.allowedValues ?? ['insufficient_evidence']).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                {step.prompt.uncertaintyOutcome && <span className="text-xs text-neutral-500">→ routed as standard outcome <code className="font-mono">insufficient_evidence</code></span>}
              </div>
              <TextArea disabled={readOnly} value={step.prompt.uncertainty} onChange={(e) => setStep((s) => void (s.prompt.uncertainty = e.target.value))} />
            </>)}
            {renderQ(GENERATION_QUESTIONS[7], !!step.prompt.writing.trim(), <>
              <TextArea disabled={readOnly} value={step.prompt.writing} onChange={(e) => setStep((s) => void (s.prompt.writing = e.target.value))} />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-neutral-500">Hard word limit</span>
                <TextInput disabled={readOnly} type="number" className="w-24" value={step.prompt.wordLimit ?? ''} onChange={(e) => setStep((s) => void (s.prompt.wordLimit = e.target.value ? Number(e.target.value) : null))} />
              </div>
              <LinkedCheck step={step} />
            </>)}
            {renderQ(GENERATION_QUESTIONS[8], step.outputSchema.length > 0, <>
              <SchemaEditor fields={step.outputSchema} onChange={(f) => setStep((s) => void (s.outputSchema = f))} readOnly={readOnly} version={version} step={step} />
            </>)}
            {renderQ(GENERATION_QUESTIONS[9], step.prompt.examples.length > 0, <>
              <ExamplesEditor examples={step.prompt.examples} onChange={(e) => setStep((s) => void (s.prompt.examples = e))} issues={stepIssues.filter((i) => i.message.includes('example')).map((i) => i.message)} />
            </>)}
          </>
        )}

        {step.type === 'validate' && (
          <>
            {renderQ(VALIDATION_QUESTIONS[0], step.bindings.some((b) => b.role === 'candidate'), <>
              <BindingsEditor step={step} roles={['candidate']} defaultRole="candidate" sample={resolved} showNote={false} sourceKinds={['outputs']} onChange={(b) => setStep((s) => void (s.bindings = b))} emptyText="Bind the output being checked, e.g. Generate summary → summary." />
            </>)}
            {renderQ(VALIDATION_QUESTIONS[1], step.bindings.some((b) => b.role === 'evidence'), <>
              <BindingsEditor step={step} roles={['evidence', 'context']} defaultRole="evidence" sample={resolved} onChange={(b) => setStep((s) => void (s.bindings = b))} emptyText="Bind the original evidence, e.g. inspection_evidence." />
            </>)}
            {renderQ(VALIDATION_QUESTIONS[2], step.prompt.criteria.length > 0, <>
              <div className="space-y-2">
                {step.prompt.criteria.map((c) => (
                  <div key={c.id} className="rounded-[6px] border border-neutral-200 bg-white p-2.5">
                    <div className="flex gap-2">
                      <TextInput disabled={readOnly} value={c.name} onChange={(e) => setStep((s) => void (s.prompt.criteria.find((x) => x.id === c.id)!.name = e.target.value))} className="font-medium" placeholder="Criterion name" />
                      {!readOnly && <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => setStep((s) => void (s.prompt.criteria = s.prompt.criteria.filter((x) => x.id !== c.id)))} />}
                    </div>
                    <TextArea disabled={readOnly} rows={2} className="mt-1.5" value={c.instructions} onChange={(e) => setStep((s) => void (s.prompt.criteria.find((x) => x.id === c.id)!.instructions = e.target.value))} placeholder="Instructions for this criterion" />
                  </div>
                ))}
                {!readOnly && (
                  <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => setStep((s) => void s.prompt.criteria.push({ id: `cr-${randomCode(5)}`, name: '', instructions: '' }))}>
                    Add criterion
                  </Button>
                )}
              </div>
            </>)}
            {renderQ(VALIDATION_QUESTIONS[3], !!step.prompt.seriousness.trim(), <>
              <TextArea disabled={readOnly} value={step.prompt.seriousness} onChange={(e) => setStep((s) => void (s.prompt.seriousness = e.target.value))} />
            </>)}
            {renderQ(VALIDATION_QUESTIONS[4], step.prompt.verdicts.length > 0, <>
              <VerdictsEditor step={step} setStep={setStep} />
              <div className="mt-3">
                <Label hint="Optional">What confidence values mean for this task</Label>
                <TextArea disabled={readOnly} rows={2} value={step.prompt.confidenceGuidance} onChange={(e) => setStep((s) => void (s.prompt.confidenceGuidance = e.target.value))} />
              </div>
              <div className="mt-3">
                <Label>All output fields (verdict, confidence, findings…)</Label>
                <SchemaEditor fields={step.outputSchema} onChange={(f) => setStep((s) => void (s.outputSchema = f))} readOnly={readOnly} version={version} step={step} />
              </div>
            </>)}
            {renderQ(VALIDATION_QUESTIONS[5], true, <>
              <VerdictRoutes step={step} onEdit={() => jump('routing')} />
            </>)}
          </>
        )}

        {step.type === 'check' && (
          <>
            <Section id="bindings" title="What does this check read?" status={step.bindings.length ? 'answered' : 'required'} open={isOpen('bindings', true)} onToggle={() => toggle('bindings', true)} help="Bind the outputs or inputs the rules examine.">
              <BindingsEditor step={step} roles={['candidate']} defaultRole="candidate" sample={resolved} showNote={false} sourceKinds={['outputs', 'dynamic']} onChange={(b) => setStep((s) => void (s.bindings = b))} />
            </Section>
            <Section id="checks" title="Rules" status={step.checks.length ? 'answered' : 'required'} open={isOpen('checks', true)} onToggle={() => toggle('checks', true)} help="Deterministic rules run without a model call. The step returns passed, word_count, invalid_refs and failures for routing.">
              <ChecksEditor step={step} setStep={setStep} />
            </Section>
          </>
        )}

        <Section id="routing" title="Routing" status={step.rules.length ? 'answered' : 'optional'} open={isOpen('routing', true)} onToggle={() => toggle('routing', true)} hasIssue={stepIssues.some((i) => i.area === 'routing' && i.severity === 'error')}>
          <RoutingEditor
            step={step}
            version={version}
            readOnly={readOnly}
            onChange={(rules, def) =>
              setStep((s) => {
                s.rules = rules
                if (def) s.defaultRoute = def
              })
            }
          />
        </Section>

        <Section id="limits" title="Retries and limits" status="answered" open={isOpen('limits', false)} onToggle={() => toggle('limits', false)}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pipeline-wide limit</Label>
              <div className="text-sm">
                {version.maxRequestAttempts} request attempts, then {version.exhaustionAction === 'manual_review' ? 'manual review' : 'fail'}.{' '}
                <button type="button" className="text-primary-700 hover:underline" onClick={() => navigate(base)}>
                  Change
                </button>
              </div>
            </div>
            <div>
              <Label hint="Optional">This step’s invocation limit</Label>
              <TextInput disabled={readOnly} type="number" min={1} placeholder="No limit" value={step.maxInvocations ?? ''} onChange={(e) => setStep((s) => void (s.maxInvocations = e.target.value ? Number(e.target.value) : null))} />
              <p className="mt-1 text-xs text-neutral-500">Counts every call of this step across attempts, including reviewer reruns.</p>
            </div>
          </div>
        </Section>
      </div>
      {step.type !== 'check' && (
        <div className="sticky top-4 self-start">
          <PromptPreview step={step} version={version} choice={choice} onChoice={setChoice} onJump={jump} />
        </div>
      )}
    </div>
  )
}

function Section({
  id,
  number,
  title,
  status,
  open,
  onToggle,
  help,
  example,
  hasIssue,
  children,
}: {
  id: string
  number?: number
  title: string
  status: 'answered' | 'required' | 'recommended' | 'optional'
  open: boolean
  onToggle: () => void
  help?: string
  example?: ReactNode
  hasIssue?: boolean
  children: ReactNode
}) {
  return (
    <section id={`q-${id}`} className={cx('surface scroll-mt-4', hasIssue && 'ring-1 ring-error-300')}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        {open ? <ChevronDown className="size-4 text-neutral-400" /> : <ChevronRight className="size-4 text-neutral-400" />}
        {number !== undefined && <span className={cx('flex size-5 items-center justify-center rounded-full text-[11px] font-semibold', status === 'answered' ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-600')}>{number}</span>}
        <span className="flex-1 font-semibold text-neutral-900">{title}</span>
        {status === 'required' && <Badge color="error">Required</Badge>}
        {status === 'recommended' && <Badge color="warning">Recommended</Badge>}
        {status === 'optional' && <Badge>Optional</Badge>}
        {status === 'answered' && <Badge color="success">Answered</Badge>}
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
          {(help || example) && (
            <div className="mb-3 grid gap-2">
              {help && <p className="text-xs leading-relaxed text-neutral-500">{help}</p>}
              {example}
            </div>
          )}
          {children}
        </div>
      )}
    </section>
  )
}

function ExampleBox({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-info-200 bg-info-50/60 px-3 py-2">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-info-600" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-info-700">Example</div>
        <p className="whitespace-pre-wrap text-xs text-info-900">{text}</p>
      </div>
      <Button size="sm" variant="outline" tone="primary" onClick={onUse}>
        Use this example
      </Button>
    </div>
  )
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (l: string[]) => void; placeholder: string }) {
  const { readOnly } = useVersion()
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="mt-2 text-neutral-400">•</span>
          <TextArea disabled={readOnly} rows={1} value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} className="min-h-8" />
          {!readOnly && <Button size="sm" variant="ghost" tone="error" className="mt-0.5" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(items.filter((_, j) => j !== i))} />}
        </div>
      ))}
      {!readOnly && (
        <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...items, ''])}>
          Add
        </Button>
      )}
    </div>
  )
}

function ExamplesEditor({ examples, onChange, issues }: { examples: PromptExample[]; onChange: (e: PromptExample[]) => void; issues: string[] }) {
  const { readOnly } = useVersion()
  const upd = (id: string, patch: Partial<PromptExample>) => onChange(examples.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <div className="space-y-2">
      {issues.map((m, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-error-700">
          <AlertTriangle className="size-3" /> {m}
        </div>
      ))}
      {examples.map((e) => (
        <div key={e.id} className="rounded-[6px] border border-neutral-200 bg-white p-2.5">
          <div className="flex gap-2">
            <Select disabled={readOnly} className="w-40" value={e.kind} onChange={(ev) => upd(e.id, { kind: ev.target.value as PromptExample['kind'] })}>
              <option value="good">Good answer</option>
              <option value="edge_case">Edge case</option>
              <option value="mistake">Common mistake</option>
            </Select>
            <TextInput disabled={readOnly} value={e.label} onChange={(ev) => upd(e.id, { label: ev.target.value })} placeholder="Short label" />
            {!readOnly && <Button size="sm" variant="ghost" tone="error" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(examples.filter((x) => x.id !== e.id))} />}
          </div>
          <TextArea disabled={readOnly} rows={2} className="mt-1.5" value={e.inputSummary} onChange={(ev) => upd(e.id, { inputSummary: ev.target.value })} placeholder="Sample inputs (summarised)" />
          <TextArea disabled={readOnly} rows={3} className="mt-1.5 font-mono text-xs" value={e.response} onChange={(ev) => upd(e.id, { response: ev.target.value })} placeholder="Preferred response (JSON)" />
          <TextInput disabled={readOnly} className="mt-1.5" value={e.explanation} onChange={(ev) => upd(e.id, { explanation: ev.target.value })} placeholder="Why this is right (or wrong)" />
        </div>
      ))}
      {!readOnly && (
        <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...examples, { id: `ex-${randomCode(5)}`, label: '', kind: examples.length ? 'edge_case' : 'good', inputSummary: '', response: '', explanation: '' }])}>
          Add example
        </Button>
      )}
    </div>
  )
}

function VerdictsEditor({ step, setStep }: { step: Step; setStep: (fn: (s: Step) => void) => void }) {
  const { readOnly } = useVersion()
  // Verdicts are kept in sync with the schema's `verdict` enum.
  const sync = (s: Step) => {
    let f = s.outputSchema.find((x) => x.name === 'verdict')
    if (!f) {
      f = { id: `f-${randomCode(5)}`, name: 'verdict', type: 'enum', required: true, description: 'Overall verdict' } as OutputField
      s.outputSchema.unshift(f)
    }
    f.type = 'enum'
    f.allowedValues = s.prompt.verdicts.map((v) => v.value)
  }
  return (
    <div className="space-y-1.5">
      {step.prompt.verdicts.map((v, i) => (
        <div key={i} className="flex gap-2">
          <TextInput
            disabled={readOnly}
            className="w-48 font-mono text-xs"
            value={v.value}
            onChange={(e) =>
              setStep((s) => {
                s.prompt.verdicts[i].value = e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
                sync(s)
              })
            }
          />
          <TextInput disabled={readOnly} value={v.meaning} onChange={(e) => setStep((s) => void (s.prompt.verdicts[i].meaning = e.target.value))} placeholder="What this verdict means" />
          {!readOnly && (
            <Button
              size="sm"
              variant="ghost"
              tone="error"
              icon={<Trash2 className="size-3.5" />}
              onClick={() =>
                setStep((s) => {
                  s.prompt.verdicts.splice(i, 1)
                  sync(s)
                })
              }
            />
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          size="sm"
          variant="soft"
          tone="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setStep((s) => {
              s.prompt.verdicts.push({ value: `verdict_${s.prompt.verdicts.length + 1}`, meaning: '' })
              sync(s)
            })
          }
        >
          Add verdict
        </Button>
      )}
      <p className="text-xs text-neutral-500">Editing these also updates the allowed values of the <code className="font-mono">verdict</code> output field. Routing rules that use a removed value are flagged.</p>
    </div>
  )
}

function VerdictRoutes({ step, onEdit }: { step: Step; onEdit: () => void }) {
  const { version } = useVersion()
  const name = (id: string | null) => version.steps.find((s) => s.id === id)?.name ?? '?'
  const hasConf = step.outputSchema.some((f) => f.name === 'confidence')
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            <th className="py-1 font-medium">Verdict</th>
            {hasConf ? (
              <>
                <th className="py-1 font-medium">Confidence 0.95</th>
                <th className="py-1 font-medium">Confidence 0.60</th>
              </>
            ) : (
              <th className="py-1 font-medium">Route</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {step.prompt.verdicts.map((v) => {
            const hi = routeStep(step, 'success', { verdict: v.value, confidence: 0.95, findings: [] })
            const lo = routeStep(step, 'success', { verdict: v.value, confidence: 0.6, findings: [] })
            return (
              <tr key={v.value}>
                <td className="py-1.5 font-mono text-xs">{v.value}</td>
                <td className="py-1.5">
                  <ActionBadge action={hi.action} stepName={name} /> <span className="text-xs text-neutral-400">{hi.label}</span>
                </td>
                {hasConf && (
                  <td className="py-1.5">
                    <ActionBadge action={lo.action} stepName={name} /> <span className="text-xs text-neutral-400">{lo.label}</span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <Button size="sm" variant="ghost" tone="primary" className="mt-2" onClick={onEdit}>
        Edit routes
      </Button>
    </div>
  )
}

function ChecksEditor({ step, setStep }: { step: Step; setStep: (fn: (s: Step) => void) => void }) {
  const { readOnly, version } = useVersion()
  const dyn = version.inputs.filter((i) => i.kind === 'dynamic')
  const upd = (i: number, patch: Partial<CheckConfig>) => setStep((s) => void Object.assign(s.checks[i], patch))
  return (
    <div className="space-y-2">
      {step.checks.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-[6px] border border-neutral-200 bg-white p-2.5">
          <Select disabled={readOnly} className="w-56" value={c.kind} onChange={(e) => upd(i, { kind: e.target.value as CheckConfig['kind'] })}>
            <option value="word_count">Word count limit</option>
            <option value="evidence_refs_valid">Evidence references are valid</option>
            <option value="required_present">Value is present</option>
          </Select>
          <span className="text-xs text-neutral-500">on</span>
          <Select disabled={readOnly} className="w-44" value={c.bindingName} onChange={(e) => upd(i, { bindingName: e.target.value })}>
            {step.bindings.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
            {!step.bindings.some((b) => b.name === c.bindingName) && <option value={c.bindingName}>{c.bindingName} (unbound)</option>}
          </Select>
          {c.kind === 'word_count' && (
            <>
              <span className="text-xs text-neutral-500">max</span>
              <TextInput disabled={readOnly} type="number" className="w-20" value={c.maxWords ?? ''} onChange={(e) => upd(i, { maxWords: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="text-xs text-neutral-500">words</span>
            </>
          )}
          {c.kind === 'evidence_refs_valid' && (
            <>
              <span className="text-xs text-neutral-500">must be in</span>
              {dyn.map((d) => (
                <label key={d.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={(c.evidenceInputIds ?? []).includes(d.id)}
                    onChange={(e) => upd(i, { evidenceInputIds: e.target.checked ? [...(c.evidenceInputIds ?? []), d.id] : (c.evidenceInputIds ?? []).filter((x) => x !== d.id) })}
                  />
                  <span className="font-mono">{d.alias}</span>
                </label>
              ))}
            </>
          )}
          {!readOnly && <Button size="sm" variant="ghost" tone="error" className="ml-auto" icon={<Trash2 className="size-3.5" />} onClick={() => setStep((s) => void s.checks.splice(i, 1))} />}
        </div>
      ))}
      {!readOnly && (
        <Button size="sm" variant="soft" tone="primary" icon={<Plus className="size-3.5" />} onClick={() => setStep((s) => void s.checks.push({ kind: 'word_count', bindingName: s.bindings[0]?.name ?? '', maxWords: 100 }))}>
          Add rule
        </Button>
      )}
    </div>
  )
}

/** Q8: offer a deterministic word-count check that matches the hard limit. */
function LinkedCheck({ step }: { step: Step }) {
  const { version, readOnly, edit } = useVersion()
  const limit = step.prompt.wordLimit
  const linked = version.steps
    .filter((s) => s.type === 'check')
    .flatMap((s) => s.checks.filter((c) => c.kind === 'word_count').map((c) => ({ s, c, b: s.bindings.find((b) => b.name === c.bindingName) })))
    .find((x) => x.b?.source.kind === 'step_output' && x.b.source.stepId === step.id)
  if (!limit && !linked) return null
  if (linked)
    return (
      <div className={cx('mt-2 flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-xs', linked.c.maxWords === limit ? 'bg-success-50 text-success-800' : 'bg-warning-50 text-warning-800')}>
        Linked check: <strong>{linked.s.name}</strong> enforces ≤ {linked.c.maxWords} words.
        {linked.c.maxWords !== limit && limit && !readOnly && (
          <Button
            size="sm"
            variant="outline"
            tone="warning"
            onClick={() =>
              edit((v) => {
                const s = v.steps.find((x) => x.id === linked.s.id)
                const c = s?.checks.find((x) => x.kind === 'word_count' && x.bindingName === linked.c.bindingName)
                if (c) c.maxWords = limit
              })
            }
          >
            Update check to {limit} words
          </Button>
        )}
      </div>
    )
  const textField = step.outputSchema.find((f) => f.name === 'summary') ?? step.outputSchema.find((f) => f.type === 'string')
  return (
    <div className="mt-2 flex items-center gap-2 rounded-[6px] bg-info-50 px-2.5 py-1.5 text-xs text-info-800">
      The model is asked to stay within {limit} words, but nothing enforces it.
      {!readOnly && textField && (
        <Button
          size="sm"
          variant="outline"
          tone="primary"
          onClick={() =>
            edit((v) => {
              const s = v.steps.find((x) => x.id === step.id) as Step
              const id = `st-${randomCode(6).toLowerCase()}`
              const prevDefault = s.defaultRoute
              for (const other of v.steps) if (other.displayOrder > s.displayOrder) other.displayOrder += 1
              v.steps.push({
                id,
                code: `check_${s.code}`.slice(0, 40),
                name: `Check ${s.name.toLowerCase()} length`,
                type: 'check',
                displayOrder: s.displayOrder + 1,
                modelConfigId: null,
                settings: { temperature: 0, maxOutputTokens: 0 },
                bindings: [{ id: `b-${randomCode(5)}`, name: textField.name, source: { kind: 'step_output', stepId: s.id, field: textField.name }, role: 'candidate', note: '' }],
                prompt: s.prompt && { ...s.prompt, examples: [], inclusion: [], evidenceRules: [], criteria: [], verdicts: [], role: '', produce: '', audience: '', background: '', uncertainty: '', uncertaintyOutcome: '', writing: '', wordLimit: null, seriousness: '', confidenceGuidance: '' },
                outputSchema: [],
                checks: [{ kind: 'word_count', bindingName: textField.name, maxWords: limit ?? 100 }],
                rules: [{ id: `r-${randomCode(5)}`, label: 'Over the limit', when: { id: `g-${randomCode(5)}`, kind: 'group', op: 'AND', items: [{ id: `c-${randomCode(5)}`, kind: 'field', field: 'passed', cmp: '=', value: false }] }, action: { type: 'retry_from', targetStepId: s.id, delaySec: 0 } }],
                defaultRoute: prevDefault,
                maxInvocations: null,
              })
              s.defaultRoute = { type: 'continue', targetStepId: id }
            })
          }
        >
          Add a word-count check after this step
        </Button>
      )}
    </div>
  )
}
