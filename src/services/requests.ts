/**
 * Simulated production processing: submit, claim, capture inputs, run attempts,
 * route, hand off to review, save results and deliver. Mirrors §3 of the brief.
 */
import type { DbAccess, Db } from '../data/db'
import { addAudit, nextId, randomCode, upsert } from '../data/db'
import type { ID, PipelineRequest, PipelineResult, PipelineVersion, ResultDelivery } from '../domain/types'
import { captureInputs } from '../engine/inputs'
import { runAttempt, type RunHost, type RunOutcome, type RunState } from '../engine/runner'
import { clone, toIso, type Clock } from '../engine/util'
import { ORG_DEFAULT_SCENARIO } from '../seed/pipelines'

export interface ProcessOptions {
  clock: Clock
  simulateLatency: boolean
  workerId: string
  /** Seed only: force the first delivery attempt to fail with this error. */
  failDelivery?: string
}

const LEASE_MS = 5 * 60 * 1000

export class SubmitError extends Error {}

export function submitRequest(
  access: DbAccess,
  args: { pipelineKey: string; orgId: ID; submissionRef: string; scenario?: string; actorId: ID; at: string },
): { request: PipelineRequest; duplicate: boolean } {
  const db = access.get()
  const pipeline = db.pipelines.find((p) => p.key === args.pipelineKey.trim())
  if (!pipeline) throw new SubmitError(`Unknown pipeline key “${args.pipelineKey}”.`)
  if (!pipeline.activeVersionId) throw new SubmitError(`Pipeline “${pipeline.name}” has no published version.`)
  if (!db.orgs.some((o) => o.id === args.orgId)) throw new SubmitError('Unknown organisation.')
  const existing = db.requests.find((r) => r.pipelineId === pipeline.id && r.submissionRef === args.submissionRef)
  if (existing) return { request: existing, duplicate: true }

  let created: PipelineRequest | undefined
  access.mutate((d) => {
    const request: PipelineRequest = {
      id: nextId(d, 'REQ'),
      pipelineId: pipeline.id,
      versionId: pipeline.activeVersionId as ID,
      orgId: args.orgId,
      submissionRef: args.submissionRef,
      status: 'queued',
      currentStepId: null,
      attemptCount: 0,
      submittedAt: args.at,
      queuedAt: args.at,
      scenario: args.scenario ?? ORG_DEFAULT_SCENARIO[args.orgId] ?? 'well_supported',
    }
    d.requests.push(request)
    const v = d.versions.find((x) => x.id === request.versionId)
    addAudit(d, { at: args.at, actorId: args.actorId, kind: 'request_submitted', message: `Submitted ${args.submissionRef}; assigned V${v?.number}`, pipelineId: pipeline.id, versionId: request.versionId, requestId: request.id })
    created = clone(request)
  })
  return { request: created as PipelineRequest, duplicate: false }
}

function patchRequest(access: DbAccess, id: ID, fn: (r: PipelineRequest, db: Db) => void) {
  access.mutate((d) => {
    const r = d.requests.find((x) => x.id === id)
    if (r) fn(r, d)
  })
}

export function eligibleRequests(db: Db, nowMs: number): PipelineRequest[] {
  return db.requests
    .filter((r) => r.status === 'queued' || (r.status === 'retry_scheduled' && (!r.nextEligibleAt || Date.parse(r.nextEligibleAt) <= nowMs)))
    .sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))
}

/** Requests whose worker lease has expired (e.g. the page was closed mid-run). */
export function recoverExpiredLeases(access: DbAccess, nowMs: number, actorId: ID): number {
  let count = 0
  access.mutate((d) => {
    for (const r of d.requests) {
      if (r.status !== 'in_progress' || !r.lease || Date.parse(r.lease.expiresAt) > nowMs) continue
      count++
      const at = toIso(nowMs)
      for (const a of d.attempts) if (a.ownerId === r.id && a.outcome === 'running') {
        a.outcome = 'interrupted'
        a.finishedAt = at
      }
      const running = d.executions.filter((e) => e.ownerId === r.id && e.status === 'running')
      for (const e of running) {
        e.status = 'failed'
        e.finishedAt = at
        e.error = e.stepType === 'check' ? 'Worker lost its lease during this step' : 'Uncertain dispatch: the worker lost its lease after the provider call may have been issued. Counted against limits; possible duplicate cost.'
      }
      const resume = running[0]?.stepId ?? r.currentStepId
      r.status = 'queued'
      r.lease = undefined
      if (resume && r.attemptCount > 0) r.pendingRetry = { fromStepId: resume, trigger: 'manual_rerun', detail: 'Recovered after lease expiry' }
      addAudit(d, { at, actorId, kind: 'lease_recovered', message: `Lease expired; request returned to the queue${running.length ? ' with an uncertain dispatch recorded' : ''}`, requestId: r.id })
    }
  })
  return count
}

/** Claim and process one request until it completes, fails, needs review or waits for a retry. */
export async function processRequest(access: DbAccess, requestId: ID, opts: ProcessOptions): Promise<void> {
  const { clock } = opts
  const actor = 'system'
  const token = randomCode(10)
  let claimed = false
  access.mutate((d) => {
    const r = d.requests.find((x) => x.id === requestId)
    if (!r || !(r.status === 'queued' || r.status === 'retry_scheduled')) return
    if (r.lease && Date.parse(r.lease.expiresAt) > clock.now()) return
    r.lease = { workerId: opts.workerId, token, expiresAt: toIso(clock.now() + LEASE_MS) }
    r.status = 'in_progress'
    r.startedAt = r.startedAt ?? toIso(clock.now())
    addAudit(d, { at: toIso(clock.now()), actorId: actor, kind: 'request_claimed', message: `Claimed by ${opts.workerId}`, requestId })
    claimed = true
  })
  if (!claimed) return

  const db = access.get()
  const request = db.requests.find((r) => r.id === requestId) as PipelineRequest
  const version = db.versions.find((v) => v.id === request.versionId) as PipelineVersion

  // Capture inputs on first processing only.
  if (!db.snapshots.some((s) => s.ownerId === requestId)) {
    const { snapshots, missing } = captureInputs({
      version,
      orgId: request.orgId,
      records: db.inputRecords,
      ownerId: requestId,
      capturedAt: toIso(clock.now()),
      newId: (p) => `${p}-${randomCode(8)}`,
    })
    access.mutate((d) => {
      d.snapshots.push(...snapshots)
      const total = snapshots.reduce((n, s) => n + s.items.length, 0)
      addAudit(d, { at: toIso(clock.now()), actorId: actor, kind: 'input_captured', message: `Captured ${total} record(s) across ${snapshots.length} input(s)`, requestId })
    })
    if (missing.length) {
      await clock.sleep(opts.simulateLatency ? 400 : 120)
      patchRequest(access, requestId, (r, d) => {
        r.status = 'missing_input'
        r.missingInputs = missing
        r.finalReason = `Missing required input: ${missing.map((m) => m.typeRef ?? m.alias).join(', ')}`
        r.finishedAt = toIso(clock.now())
        r.lease = undefined
        addAudit(d, { at: r.finishedAt, actorId: actor, kind: 'status_changed', message: `Missing input (${missing.map((m) => m.alias).join(', ')}); stopped before any model call`, requestId })
      })
      return
    }
  }
  if (opts.simulateLatency) await clock.sleep(300)

  const fresh = access.get()
  const req = fresh.requests.find((r) => r.id === requestId) as PipelineRequest
  const state: RunState = {
    ownerId: requestId,
    version,
    orgId: req.orgId,
    scenario: req.scenario,
    snapshots: fresh.snapshots.filter((s) => s.ownerId === requestId),
    attempts: clone(fresh.attempts.filter((a) => a.ownerId === requestId)),
    executions: clone(fresh.executions.filter((e) => e.ownerId === requestId)),
    models: fresh.models,
    rates: fresh.rates,
  }
  const host = makeHost(access, requestId, clock, opts.simulateLatency, 'production')
  const start = req.pendingRetry?.fromStepId ?? (version.entryStepId as ID)
  const trigger = req.pendingRetry?.trigger ?? 'initial'
  const outcome = await runAttempt(state, host, start, trigger, req.pendingRetry?.detail)
  await applyOutcome(access, requestId, outcome, opts)
}

export function makeHost(access: DbAccess, ownerId: ID, clock: Clock, simulateLatency: boolean, mode: 'production' | 'test'): RunHost {
  return {
    clock,
    simulateLatency,
    newId: (p) => `${p}-${randomCode(8)}`,
    onAttempt: (a) =>
      access.mutate((d) => {
        upsert(mode === 'production' ? d.attempts : d.testAttempts, a)
        if (mode === 'production') {
          const r = d.requests.find((x) => x.id === ownerId)
          if (r) r.attemptCount = d.attempts.filter((x) => x.ownerId === ownerId).length
        }
      }),
    onExecution: (e) => access.mutate((d) => upsert(mode === 'production' ? d.executions : d.testExecutions, e)),
    onStepChange: (stepId) =>
      access.mutate((d) => {
        if (mode !== 'production') return
        const r = d.requests.find((x) => x.id === ownerId)
        if (r) {
          r.currentStepId = stepId
          if (r.lease) r.lease.expiresAt = toIso(clock.now() + LEASE_MS) // renew while working
        }
      }),
    audit: (kind, message, stepId) =>
      access.mutate((d) => {
        if (mode === 'production') addAudit(d, { at: toIso(clock.now()), actorId: 'system', kind, message, requestId: ownerId, stepId })
      }),
  }
}

async function applyOutcome(access: DbAccess, requestId: ID, outcome: RunOutcome, opts: ProcessOptions) {
  const { clock } = opts
  const at = toIso(clock.now())
  if (outcome.kind === 'complete') {
    const resultId = saveResult(access, requestId, outcome.payload, outcome.evidenceRefs, { kind: 'automatic', by: 'Pipeline (automatic)', at, edited: false })
    if (resultId) await deliverResult(access, resultId, { clock, simulateLatency: opts.simulateLatency, actorId: 'system', forceError: opts.failDelivery })
    return
  }
  patchRequest(access, requestId, (r, d) => {
    r.lease = undefined
    r.pendingRetry = undefined
    if (outcome.kind === 'manual_review') {
      r.status = 'awaiting_review'
      r.reviewReason = outcome.reason
      const review = {
        id: nextId(d, 'RV'),
        requestId,
        attemptId: d.attempts.filter((a) => a.ownerId === requestId).slice(-1)[0]?.id ?? '',
        sourceStepId: outcome.sourceStepId,
        sourceExecutionId: outcome.sourceExecutionId,
        candidate: outcome.candidate,
        reason: outcome.reason,
        createdAt: at,
        status: 'open' as const,
      }
      d.reviews.push(review)
      addAudit(d, { at, actorId: 'system', kind: 'review_created', message: `Sent to manual review: ${outcome.reason}`, requestId, reviewId: review.id })
    } else if (outcome.kind === 'failed') {
      r.status = 'failed'
      r.finalReason = outcome.reason
      r.finishedAt = at
      r.currentStepId = null
      addAudit(d, { at, actorId: 'system', kind: 'status_changed', message: `Failed: ${outcome.reason}`, requestId })
    } else if (outcome.kind === 'retry_scheduled') {
      r.status = 'retry_scheduled'
      r.nextEligibleAt = toIso(clock.now() + outcome.delaySec * 1000)
      r.pendingRetry = { fromStepId: outcome.fromStepId, trigger: 'retry_rule', detail: outcome.reason }
      r.currentStepId = outcome.fromStepId
    }
  })
}

export function saveResult(
  access: DbAccess,
  requestId: ID,
  payload: Record<string, unknown>,
  evidenceRefs: string[],
  approval: PipelineResult['approval'],
): ID | null {
  let resultId: ID | null = null
  access.mutate((d) => {
    const r = d.requests.find((x) => x.id === requestId)
    if (!r) return
    const result: PipelineResult = {
      id: `RES-${randomCode(8)}`,
      requestId,
      orgId: r.orgId,
      versionId: r.versionId,
      payload,
      evidenceRefs,
      approval,
      createdAt: approval.at,
    }
    d.results.push(result)
    const version = d.versions.find((v) => v.id === r.versionId)
    // Commit the result and the pending delivery in the same transaction as completion.
    if (version?.destination) {
      d.deliveries.push({
        id: `DLV-${randomCode(8)}`,
        resultId: result.id,
        requestId,
        destination: 'athena',
        deliveryKey: `athena:${r.pipelineId}:${r.submissionRef}`,
        status: 'pending',
        attempts: [],
      })
    }
    r.status = 'completed'
    r.finishedAt = approval.at
    r.currentStepId = null
    r.lease = undefined
    r.pendingRetry = undefined
    addAudit(d, { at: approval.at, actorId: approval.kind === 'automatic' ? 'system' : d.currentUserId, kind: 'result_saved', message: `Result saved (${approval.kind === 'automatic' ? 'automatic approval' : `approved by ${approval.by}${approval.edited ? ', edited' : ''}`})`, requestId })
    resultId = result.id
  })
  return resultId
}

export function buildDestinationPayload(db: Db, version: PipelineVersion, request: PipelineRequest, result: PipelineResult): Record<string, unknown> {
  const dest = version.destination
  if (!dest) return {}
  const insight: Record<string, unknown> = {}
  for (const f of dest.fields) {
    const key = f.target.replace(/^Insight\./, '')
    if (f.source.kind === 'fixed') insight[key] = f.source.value
    else if (f.source.kind === 'request') insight[key] = f.source.field === 'orgId' ? request.orgId : f.source.field === 'requestId' ? request.id : version.number
    else insight[key] = result.payload[f.source.field] ?? null
  }
  const evidence = result.evidenceRefs.map((ref) => {
    const rec = db.inputRecords.find((r) => r.id === ref)
    return { SourceRowId: ref, Kind: rec?.typeRef === 'Atlas:Destinations' ? 'Fact' : 'ContentSnippet', SourceUrl: rec?.sourceUrl ?? null }
  })
  return { Insight: insight, Evidence: evidence }
}

/** Send an approved result to its destination. Independent of AI processing. */
export async function deliverResult(
  access: DbAccess,
  resultId: ID,
  opts: { clock: Clock; simulateLatency: boolean; actorId: ID; forceError?: string },
): Promise<void> {
  const db = access.get()
  const delivery = db.deliveries.find((x) => x.resultId === resultId)
  if (!delivery || delivery.status === 'delivered') return
  const result = db.results.find((r) => r.id === resultId) as PipelineResult
  const request = db.requests.find((r) => r.id === result.requestId) as PipelineRequest
  const version = db.versions.find((v) => v.id === request.versionId) as PipelineVersion
  const payload = buildDestinationPayload(db, version, request, result)
  await opts.clock.sleep(opts.simulateLatency ? 700 : 900)
  const error = opts.forceError ?? (db.settings.athenaOutage ? 'Athena write API returned 503 Service Unavailable (simulated outage)' : undefined)
  const at = toIso(opts.clock.now())
  access.mutate((d) => {
    const dl = d.deliveries.find((x) => x.id === delivery.id) as ResultDelivery
    dl.payload = payload
    dl.attempts.push({ at, outcome: error ? 'failed' : 'delivered', error, actorId: opts.actorId })
    dl.status = error ? 'failed' : 'delivered'
    dl.latestError = error
    addAudit(d, { at, actorId: opts.actorId, kind: 'delivery_attempted', message: error ? `Delivery to Athena failed: ${error}` : `Delivered to Athena (key ${dl.deliveryKey})`, requestId: request.id, deliveryId: dl.id })
  })
}
