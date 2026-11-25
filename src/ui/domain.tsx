import { Bot, CircleCheck, FlaskConical, ListChecks, ShieldCheck, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/store'
import type { PipelineRequest, PipelineVersion, ResultDelivery, RouteAction, StandardOutcome, StepType } from '../domain/types'
import { Badge, cx, type BadgeColor } from './kit'

export const STATUS_META: Record<PipelineRequest['status'], { label: string; color: BadgeColor }> = {
  queued: { label: 'Queued', color: 'neutral' },
  in_progress: { label: 'In progress', color: 'primary' },
  retry_scheduled: { label: 'Retry scheduled', color: 'info' },
  awaiting_review: { label: 'Awaiting review', color: 'warning' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  missing_input: { label: 'Missing input', color: 'secondary' },
}

export function StatusBadge({ status }: { status: PipelineRequest['status'] }) {
  const m = STATUS_META[status]
  return (
    <Badge color={m.color} dot>
      {m.label}
    </Badge>
  )
}

export function DeliveryBadge({ delivery }: { delivery?: ResultDelivery }) {
  if (!delivery) return <span className="text-xs text-neutral-400">—</span>
  const color: BadgeColor = delivery.status === 'delivered' ? 'success' : delivery.status === 'failed' ? 'error' : 'neutral'
  return <Badge color={color}>{delivery.status === 'delivered' ? 'Delivered' : delivery.status === 'failed' ? 'Delivery failed' : 'Delivery pending'}</Badge>
}

export function VersionBadge({ version, active }: { version?: PipelineVersion; active?: boolean }) {
  if (!version) return null
  return (
    <span className="inline-flex items-center gap-1">
      <Badge color={version.state === 'draft' ? 'warning' : 'primary'}>V{version.number}</Badge>
      {version.state === 'draft' && <span className="text-xs text-warning-700">draft</span>}
      {active && <span className="text-xs text-primary-700">active</span>}
    </span>
  )
}

export const OUTCOME_COLOR: Record<StandardOutcome, BadgeColor> = {
  success: 'success',
  invalid_output: 'error',
  provider_error: 'error',
  timeout: 'error',
  insufficient_evidence: 'warning',
  check_failed: 'warning',
}

export function OutcomeBadge({ outcome }: { outcome?: StandardOutcome }) {
  if (!outcome) return null
  return <Badge color={OUTCOME_COLOR[outcome]}>{outcome}</Badge>
}

export function StepTypeIcon({ type, className }: { type: StepType; className?: string }) {
  const Icon = type === 'generate' ? Sparkles : type === 'validate' ? ShieldCheck : ListChecks
  const color = type === 'generate' ? 'text-primary-600 bg-primary-50' : type === 'validate' ? 'text-secondary-600 bg-secondary-50' : 'text-neutral-600 bg-neutral-100'
  return (
    <span className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-[6px]', color, className)}>
      <Icon className="size-4" />
    </span>
  )
}

export const STEP_TYPE_LABEL: Record<StepType, string> = {
  generate: 'Generation',
  validate: 'Model validation',
  check: 'Deterministic check',
}

export function actionColor(a: RouteAction): BadgeColor {
  switch (a.type) {
    case 'continue':
      return 'primary'
    case 'complete':
      return 'success'
    case 'retry_from':
      return 'info'
    case 'fail':
      return 'error'
    case 'manual_review':
      return 'warning'
  }
}

export function ActionBadge({ action, stepName }: { action: RouteAction; stepName: (id: string | null) => string }) {
  const text =
    action.type === 'continue'
      ? `→ ${stepName(action.targetStepId)}`
      : action.type === 'complete'
        ? 'Complete'
        : action.type === 'retry_from'
          ? `↺ Retry from ${stepName(action.targetStepId)}${action.delaySec ? ` (${action.delaySec}s)` : ''}`
          : action.type === 'fail'
            ? 'Fail'
            : 'Manual review'
  return <Badge color={actionColor(action)}>{text}</Badge>
}

export function SimulatedBadge({ children = 'Simulated' }: { children?: ReactNode }) {
  return (
    <Badge color="secondary">
      <FlaskConical className="size-3" />
      {children}
    </Badge>
  )
}

export function ModelChip({ provider, model }: { provider: string; model: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">
      <Bot className="size-3 text-neutral-500" />
      {provider} · <span className="font-mono text-[11px]">{model}</span>
    </span>
  )
}

export function OrgName({ id, link = false }: { id: string | null; link?: boolean }) {
  const org = useDb((db) => db.orgs.find((o) => o.id === id))
  if (!org) return <span className="text-neutral-400">Manual values</span>
  if (!link) return <span>{org.name}</span>
  return (
    <Link to={`/sources?org=${org.id}`} className="hover:underline">
      {org.name}
    </Link>
  )
}

export function UserName({ id }: { id?: string }) {
  const u = useDb((db) => db.users.find((x) => x.id === id))
  return <span>{u?.name ?? id ?? '—'}</span>
}

export function PassIcon({ passed }: { passed: boolean }) {
  return passed ? <CircleCheck className="size-4 text-success-600" /> : <span className="inline-flex size-4 items-center justify-center rounded-full bg-error-500 text-[10px] font-bold text-white">!</span>
}
