import type { Db, DbAccess } from '../data/db'
import { addAudit } from '../data/db'
import type { ID, ManualReview, PipelineRequest, PipelineVersion, Step } from '../domain/types'
import { validateAgainstSchema } from '../engine/schema'
import { toIso, type Clock } from '../engine/util'
import { deliverResult, processRequest, saveResult } from './requests'

export type ReviewDecision =
  | { kind: 'approve'; reason: string }
  | { kind: 'edit'; output: Record<string, unknown>; reason: string }
  | { kind: 'reject'; reason: string }
  | { kind: 'rerun'; fromStepId: ID; reason: string }

export function reviewContext(db: Db, review: ManualReview) {
  const request = db.requests.find((r) => r.id === review.requestId) as PipelineRequest
  const version = db.versions.find((v) => v.id === request.versionId) as PipelineVersion
  const remaining = Math.max(0, version.maxRequestAttempts - request.attemptCount)
  const ran = new Set(db.executions.filter((e) => e.ownerId === request.id && e.status !== 'reused').map((e) => e.stepId))
  const eligible: Step[] = version.steps.filter((s) => ran.has(s.id)).sort((a, b) => a.displayOrder - b.displayOrder)
  const resultStep = version.steps.find((s) => s.id === version.resultStepId)
  return { request, version, remaining, eligible, resultStep }
}

export class ReviewError extends Error {}

export async function decideReview(
  access: DbAccess,
  reviewId: ID,
  decision: ReviewDecision,
  opts: { actorId: ID; clock: Clock; simulateLatency: boolean },
): Promise<void> {
  const db = access.get()
  const review = db.reviews.find((r) => r.id === reviewId)
  if (!review) throw new ReviewError('Review not found.')
  const { request, version, remaining, resultStep } = reviewContext(db, review)
  const reviewer = db.users.find((u) => u.id === opts.actorId)?.name ?? opts.actorId

  if (decision.kind === 'edit') {
    const errors = validateAgainstSchema(resultStep?.outputSchema ?? [], decision.output)
    if (errors.length) throw new ReviewError(`The edited output does not match the result schema: ${errors.join('; ')}`)
  }
  if (decision.kind === 'rerun' && remaining <= 0) throw new ReviewError('No request attempts remain for a rerun.')

  // Resolve atomically: a second reviewer cannot resolve the same case.
  let resolved = false
  const at = toIso(opts.clock.now())
  access.mutate((d) => {
    const rv = d.reviews.find((r) => r.id === reviewId)
    if (!rv || rv.status !== 'open') return
    rv.status = 'resolved'
    rv.reviewerId = opts.actorId
    rv.decidedAt = at
    rv.decisionReason = decision.reason
    rv.decision = decision.kind === 'approve' ? 'approved' : decision.kind === 'edit' ? 'edited_approved' : decision.kind === 'reject' ? 'rejected' : 'rerun'
    if (decision.kind === 'edit') rv.editedOutput = decision.output
    if (decision.kind === 'rerun') rv.rerunFromStepId = decision.fromStepId
    const label = { approve: 'approved the candidate', edit: 'edited and approved the candidate', reject: 'rejected the candidate', rerun: `requested a rerun from ${version.steps.find((s) => s.id === (decision as { fromStepId?: ID }).fromStepId)?.name}` }[decision.kind]
    addAudit(d, { at, actorId: opts.actorId, kind: 'review_decided', message: `${reviewer} ${label}${decision.reason ? `: “${decision.reason}”` : ''}`, requestId: request.id, reviewId })
    const r = d.requests.find((x) => x.id === request.id) as PipelineRequest
    if (decision.kind === 'reject') {
      r.status = 'failed'
      r.finalReason = `Rejected in manual review${decision.reason ? `: ${decision.reason}` : ''}`
      r.finishedAt = at
    }
    if (decision.kind === 'rerun') {
      r.status = 'queued'
      r.pendingRetry = { fromStepId: decision.fromStepId, trigger: 'reviewer_rerun', detail: `Reviewer rerun by ${reviewer}${decision.reason ? `: ${decision.reason}` : ''}` }
    }
    resolved = true
  })
  if (!resolved) throw new ReviewError('This case has already been resolved by another reviewer.')

  const evField = version.destination?.evidenceField ?? 'evidence_refs'
  if (decision.kind === 'approve' || decision.kind === 'edit') {
    const payload = decision.kind === 'edit' ? decision.output : review.candidate
    const refs = Array.isArray(payload[evField]) ? (payload[evField] as unknown[]).map(String) : []
    const resultId = saveResult(access, request.id, payload, refs, { kind: 'manual', by: reviewer, at, reviewId, edited: decision.kind === 'edit' })
    if (resultId) await deliverResult(access, resultId, { clock: opts.clock, simulateLatency: opts.simulateLatency, actorId: opts.actorId })
  }
  if (decision.kind === 'rerun') {
    await processRequest(access, request.id, { clock: opts.clock, simulateLatency: opts.simulateLatency, workerId: 'worker-review-rerun' })
  }
}
