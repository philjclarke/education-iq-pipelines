import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { randomCode } from '../../data/db'
import { STANDARD_OUTCOMES, type Comparator, type Condition, type PipelineVersion, type RouteAction, type RoutingRule, type Step } from '../../domain/types'
import { fieldsOf, forwardReachable } from '../../engine/graph'
import { describeCondition } from '../../engine/routing'
import { ActionBadge } from '../../ui/domain'
import { Badge, Button, cx, TextInput } from '../../ui/kit'

const CMPS: Comparator[] = ['=', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains', 'is_empty', 'not_empty']
const SEL = 'h-8 rounded-[6px] border border-neutral-300 bg-white px-2 text-sm disabled:bg-neutral-50'

function newCondition(step: Step): Condition {
  const f = fieldsOf(step).find((x) => x.type !== 'object_list')
  return f ? { id: `c-${randomCode(6)}`, kind: 'field', field: f.name, cmp: '=', value: f.allowedValues?.[0] ?? (f.type === 'boolean' ? true : '') } : { id: `c-${randomCode(6)}`, kind: 'outcome', cmp: '=', value: 'success' }
}

function ConditionEditor({ c, step, onChange, onRemove, readOnly, depth }: { c: Condition; step: Step; onChange: (c: Condition) => void; onRemove?: () => void; readOnly: boolean; depth: number }) {
  const fields = fieldsOf(step).filter((f) => f.type !== 'object_list')
  if (c.kind === 'group') {
    return (
      <div className={cx('space-y-1.5 rounded-[6px] p-2', depth > 0 ? 'border border-dashed border-neutral-300 bg-white' : 'bg-neutral-50')}>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500">{depth === 0 ? 'When' : 'Group:'}</span>
          <div className="inline-flex overflow-hidden rounded-[5px] ring-1 ring-neutral-300">
            {(['AND', 'OR'] as const).map((op) => (
              <button key={op} type="button" disabled={readOnly} onClick={() => onChange({ ...c, op })} className={cx('px-2 py-0.5 font-semibold', c.op === op ? 'bg-primary-600 text-white' : 'bg-white text-neutral-500')}>
                {op === 'AND' ? 'all of' : 'any of'}
              </button>
            ))}
          </div>
          {onRemove && !readOnly && (
            <button type="button" onClick={onRemove} className="ml-auto text-neutral-400 hover:text-error-600" title="Remove group">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        {c.items.map((item, i) => (
          <ConditionEditor
            key={item.id}
            c={item}
            step={step}
            depth={depth + 1}
            readOnly={readOnly}
            onChange={(n) => onChange({ ...c, items: c.items.map((x, j) => (j === i ? n : x)) })}
            onRemove={() => onChange({ ...c, items: c.items.filter((_, j) => j !== i) })}
          />
        ))}
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" tone="primary" icon={<Plus className="size-3" />} onClick={() => onChange({ ...c, items: [...c.items, newCondition(step)] })}>
              Condition
            </Button>
            {depth < 2 && (
              <Button size="sm" variant="ghost" icon={<Plus className="size-3" />} onClick={() => onChange({ ...c, items: [...c.items, { id: `g-${randomCode(6)}`, kind: 'group', op: c.op === 'AND' ? 'OR' : 'AND', items: [newCondition(step)] }] })}>
                Group
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }
  const field = c.kind === 'field' ? fields.find((f) => f.name === c.field) : undefined
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        disabled={readOnly}
        className={SEL}
        value={c.kind === 'outcome' ? '__outcome' : c.field}
        onChange={(e) => {
          if (e.target.value === '__outcome') onChange({ id: c.id, kind: 'outcome', cmp: '=', value: 'success' })
          else {
            const f = fields.find((x) => x.name === e.target.value)
            onChange({ id: c.id, kind: 'field', field: e.target.value, cmp: '=', value: f?.allowedValues?.[0] ?? (f?.type === 'boolean' ? true : f?.type === 'number' ? 0 : '') })
          }
        }}
      >
        <option value="__outcome">Standard outcome</option>
        {fields.map((f) => (
          <option key={f.id} value={f.name}>
            {f.name}
          </option>
        ))}
        {c.kind === 'field' && !field && <option value={c.field}>{c.field} (missing)</option>}
      </select>
      {c.kind === 'outcome' ? (
        <>
          <select disabled={readOnly} className={SEL} value={c.cmp} onChange={(e) => onChange({ ...c, cmp: e.target.value as '=' | '!=' })}>
            <option value="=">is</option>
            <option value="!=">is not</option>
          </select>
          <select disabled={readOnly} className={SEL} value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value as typeof c.value })}>
            {STANDARD_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <select disabled={readOnly} className={SEL} value={c.cmp} onChange={(e) => onChange({ ...c, cmp: e.target.value as Comparator })}>
            {CMPS.filter((x) => (field?.type === 'number' ? true : !['>', '>=', '<', '<='].includes(x)) || x === c.cmp).map((x) => (
              <option key={x} value={x}>
                {x.replace('_', ' ')}
              </option>
            ))}
          </select>
          {!['is_empty', 'not_empty'].includes(c.cmp) &&
            (field?.type === 'enum' && !['in', 'not_in'].includes(c.cmp) ? (
              <select disabled={readOnly} className={cx(SEL, !(field.allowedValues ?? []).includes(String(c.value)) && 'border-error-400 text-error-700')} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value })}>
                {!(field.allowedValues ?? []).includes(String(c.value)) && <option value={String(c.value)}>{String(c.value)} (not allowed)</option>}
                {(field.allowedValues ?? []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : field?.type === 'boolean' ? (
              <select disabled={readOnly} className={SEL} value={String(c.value)} onChange={(e) => onChange({ ...c, value: e.target.value === 'true' })}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <TextInput
                disabled={readOnly}
                className="w-36"
                type={field?.type === 'number' ? 'number' : 'text'}
                step="0.01"
                value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}
                onChange={(e) => {
                  const raw = e.target.value
                  const value = ['in', 'not_in'].includes(c.cmp) ? raw.split(',').map((s) => s.trim()) : field?.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw
                  onChange({ ...c, value })
                }}
              />
            ))}
        </>
      )}
      {onRemove && !readOnly && (
        <button type="button" onClick={onRemove} className="text-neutral-400 hover:text-error-600" title="Remove condition">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function ActionEditor({ action, onChange, step, version, readOnly }: { action: RouteAction; onChange: (a: RouteAction) => void; step: Step; version: PipelineVersion; readOnly: boolean }) {
  const others = version.steps.filter((s) => s.id !== step.id)
  const retryTargets = version.steps.filter((s) => s.id === step.id || forwardReachable(version, s.id).has(step.id))
  const reused = action.type === 'retry_from' && action.targetStepId ? version.steps.filter((s) => !forwardReachable(version, action.targetStepId as string).has(s.id)) : []
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-neutral-500">Then</span>
        <select
          disabled={readOnly}
          className={SEL}
          value={action.type}
          onChange={(e) => {
            const t = e.target.value as RouteAction['type']
            if (t === 'continue') onChange({ type: 'continue', targetStepId: others[0]?.id ?? null })
            if (t === 'complete') onChange({ type: 'complete' })
            if (t === 'retry_from') onChange({ type: 'retry_from', targetStepId: retryTargets[0]?.id ?? step.id, delaySec: 0 })
            if (t === 'fail') onChange({ type: 'fail', reason: '' })
            if (t === 'manual_review') onChange({ type: 'manual_review', reason: '' })
          }}
        >
          <option value="continue">Continue to step</option>
          <option value="complete">Complete</option>
          <option value="retry_from">Retry from step</option>
          <option value="fail">Fail</option>
          <option value="manual_review">Send to manual review</option>
        </select>
        {action.type === 'continue' && (
          <select disabled={readOnly} className={cx(SEL, !others.some((s) => s.id === action.targetStepId) && 'border-error-400')} value={action.targetStepId ?? ''} onChange={(e) => onChange({ ...action, targetStepId: e.target.value || null })}>
            <option value="">Choose step…</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {action.type === 'retry_from' && (
          <>
            <select disabled={readOnly} className={SEL} value={action.targetStepId ?? ''} onChange={(e) => onChange({ ...action, targetStepId: e.target.value || null })}>
              <option value="">Restart point…</option>
              {retryTargets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">after</span>
            <TextInput disabled={readOnly} type="number" min={0} className="w-20" value={action.delaySec} onChange={(e) => onChange({ ...action, delaySec: Math.max(0, Number(e.target.value) || 0) })} />
            <span className="text-xs text-neutral-500">seconds</span>
          </>
        )}
        {(action.type === 'fail' || action.type === 'manual_review') && (
          <TextInput disabled={readOnly} className="w-72" placeholder="Reason shown on the request" value={action.reason} onChange={(e) => onChange({ ...action, reason: e.target.value })} />
        )}
      </div>
      {action.type === 'retry_from' && (
        <div className="rounded-[6px] bg-info-50 px-2.5 py-1.5 text-xs text-info-800">
          The next attempt reuses the captured input snapshot{reused.length ? <> and the outputs of <strong>{reused.map((s) => s.name).join(', ')}</strong></> : ''}. It recomputes from {version.steps.find((s) => s.id === action.targetStepId)?.name ?? '…'} onwards and counts as a new request attempt (limit {version.maxRequestAttempts}).
        </div>
      )}
    </div>
  )
}

export function RoutingEditor({ step, version, readOnly, onChange }: { step: Step; version: PipelineVersion; readOnly: boolean; onChange: (rules: RoutingRule[], def?: RouteAction) => void }) {
  const stepName = (id: string | null) => version.steps.find((s) => s.id === id)?.name ?? '?'
  const move = (i: number, d: number) => {
    const rules = [...step.rules]
    const [r] = rules.splice(i, 1)
    rules.splice(i + d, 0, r)
    onChange(rules)
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">Rules are evaluated in order. The first match decides the route; if none match, the default route applies. Conditions can use the standard outcome, structured output fields, or both.</p>
      {step.rules.map((rule, i) => (
        <div key={rule.id} id={`rule-${rule.id}`} className="rounded-[8px] border border-neutral-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge>{i + 1}</Badge>
            <TextInput disabled={readOnly} value={rule.label} onChange={(e) => onChange(step.rules.map((r) => (r.id === rule.id ? { ...r, label: e.target.value } : r)))} className="h-7 max-w-xs font-medium" />
            <span className="truncate text-xs text-neutral-400">{describeCondition(rule.when)}</span>
            {!readOnly && (
              <div className="ml-auto flex shrink-0 gap-0.5">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="size-3.5" />} title="Move up" />
                <Button size="sm" variant="ghost" disabled={i === step.rules.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="size-3.5" />} title="Move down" />
                <Button size="sm" variant="ghost" tone="error" onClick={() => onChange(step.rules.filter((r) => r.id !== rule.id))} icon={<Trash2 className="size-3.5" />} title="Delete rule" />
              </div>
            )}
          </div>
          <ConditionEditor c={rule.when} step={step} depth={0} readOnly={readOnly} onChange={(when) => onChange(step.rules.map((r) => (r.id === rule.id ? { ...r, when } : r)))} />
          <div className="mt-2">
            <ActionEditor action={rule.action} step={step} version={version} readOnly={readOnly} onChange={(action) => onChange(step.rules.map((r) => (r.id === rule.id ? { ...r, action } : r)))} />
          </div>
        </div>
      ))}
      {!readOnly && (
        <Button
          size="sm"
          variant="soft"
          tone="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() => onChange([...step.rules, { id: `r-${randomCode(6)}`, label: `Rule ${step.rules.length + 1}`, when: { id: `g-${randomCode(6)}`, kind: 'group', op: 'AND', items: [newCondition(step)] }, action: { type: 'complete' } }])}
        >
          Add rule
        </Button>
      )}
      <div className="rounded-[8px] border-2 border-dashed border-neutral-300 bg-white p-3">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          Default route <span className="text-xs font-normal text-neutral-500">(required, used when no rule matches)</span>
          <span className="ml-auto">
            <ActionBadge action={step.defaultRoute} stepName={stepName} />
          </span>
        </div>
        <ActionEditor action={step.defaultRoute} step={step} version={version} readOnly={readOnly} onChange={(a) => onChange(step.rules, a)} />
      </div>
    </div>
  )
}
