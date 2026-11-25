/**
 * Builds the seeded database by running the real engine over a plan of
 * historical submissions on a virtual clock. Every seeded trace is therefore
 * produced by the same code that runs live.
 */
import { DB_SCHEMA_VERSION, type Db, type DbAccess } from '../data/db'
import { virtualClock, toIso } from '../engine/util'
import { UNSUPPORTED_CLAIM } from '../engine/mockProvider'
import { processRequest, submitRequest } from '../services/requests'
import { decideReview } from '../services/reviews'
import { INPUT_RECORDS, INPUT_TYPES, ORGS, SENTIMENTS, THEMES, USERS } from './content'
import { MODELS, NEWS_PIPELINE, NEWS_V1, OFSTED_PIPELINE, OFSTED_V1, RATES, ofstedV2Draft, seedTestCases } from './pipelines'

interface PlanItem {
  pipeline: 'ofsted' | 'news'
  org: string
  scenario: string
  /** Minutes before the seed time. */
  ago: number
  failDelivery?: string
  /** Leave in the queue without processing. */
  queueOnly?: boolean
  /** Process the scheduled retry as well. */
  resolveRetry?: boolean
  review?: { decision: 'edit' | 'reject' | 'approve'; reason: string; afterMin: number }
}

const D = 24 * 60
const H = 60

const PLAN: PlanItem[] = [
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 13 * D + 3 * H },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 12 * D + 5 * H },
  { pipeline: 'ofsted', org: 'org-riverside', scenario: 'well_supported', ago: 12 * D + 2 * H },
  { pipeline: 'ofsted', org: 'org-harbour', scenario: 'worked_example', ago: 11 * D + 6 * H },
  { pipeline: 'ofsted', org: 'org-thornbury', scenario: 'invalid_json', ago: 11 * D + 1 * H },
  {
    pipeline: 'ofsted', org: 'org-fenwick', scenario: 'unsupported_claim', ago: 10 * D + 4 * H,
    review: { decision: 'edit', reason: 'Removed the accreditation and work-experience claim; no excerpt supports it.', afterMin: 5 * H },
  },
  { pipeline: 'ofsted', org: 'org-kingsmead', scenario: 'too_long', ago: 10 * D + 2 * H },
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 9 * D + 7 * H },
  { pipeline: 'ofsted', org: 'org-oakfield', scenario: 'insufficient', ago: 9 * D + 3 * H },
  { pipeline: 'ofsted', org: 'org-ashcombe', scenario: 'provider_error', ago: 8 * D + 6 * H, resolveRetry: true },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 8 * D + 2 * H },
  { pipeline: 'news', org: 'org-harbour', scenario: 'well_supported', ago: 7 * D + 5 * H },
  {
    pipeline: 'ofsted', org: 'org-fenwick', scenario: 'unsupported_claim', ago: 7 * D + 4 * H,
    review: { decision: 'reject', reason: 'Unsupported accreditation claim. Holding until the evidence instructions are tightened.', afterMin: 3 * H },
  },
  { pipeline: 'news', org: 'org-fenwick', scenario: 'well_supported', ago: 6 * D + 8 * H },
  { pipeline: 'ofsted', org: 'org-harbour', scenario: 'well_supported', ago: 6 * D + 3 * H },
  { pipeline: 'ofsted', org: 'org-riverside', scenario: 'well_supported', ago: 6 * D + 1 * H },
  { pipeline: 'ofsted', org: 'org-kingsmead', scenario: 'too_long', ago: 5 * D + 6 * H },
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 5 * D + 2 * H },
  { pipeline: 'ofsted', org: 'org-ashcombe', scenario: 'provider_error', ago: 4 * D + 7 * H, resolveRetry: true },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 4 * D + 3 * H },
  { pipeline: 'news', org: 'org-kingsmead', scenario: 'well_supported', ago: 3 * D + 9 * H },
  { pipeline: 'ofsted', org: 'org-harbour', scenario: 'worked_example', ago: 3 * D + 5 * H },
  { pipeline: 'ofsted', org: 'org-thornbury', scenario: 'invalid_json', ago: 3 * D + 2 * H },
  { pipeline: 'news', org: 'org-oakfield', scenario: 'well_supported', ago: 2 * D + 6 * H },
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 2 * D + 4 * H, failDelivery: 'Athena write API returned 503 Service Unavailable' },
  { pipeline: 'ofsted', org: 'org-oakfield', scenario: 'insufficient', ago: 2 * D + 2 * H },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 2 * D + 1 * H },
  { pipeline: 'ofsted', org: 'org-kingsmead', scenario: 'too_long', ago: 1 * D + 5 * H },
  { pipeline: 'ofsted', org: 'org-fenwick', scenario: 'unsupported_claim', ago: 1 * D + 3 * H },
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 1 * D + 1 * H },
  { pipeline: 'ofsted', org: 'org-riverside', scenario: 'well_supported', ago: 11 * H },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 7 * H, failDelivery: 'Athena write API timed out after 30s' },
  { pipeline: 'ofsted', org: 'org-fenwick', scenario: 'unsupported_claim', ago: 5 * H },
  { pipeline: 'ofsted', org: 'org-ashcombe', scenario: 'provider_error', ago: 1 },
  { pipeline: 'ofsted', org: 'org-millbrook', scenario: 'well_supported', ago: 0.6, queueOnly: true },
  { pipeline: 'ofsted', org: 'org-staidans', scenario: 'well_supported', ago: 0.5, queueOnly: true },
  { pipeline: 'ofsted', org: 'org-kingsmead', scenario: 'too_long', ago: 0.4, queueOnly: true },
]

export function emptyDb(nowIso: string): Db {
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    seededAt: nowIso,
    counters: {},
    currentUserId: 'u-priya',
    settings: { athenaOutage: false },
    users: structuredClone(USERS),
    orgs: structuredClone(ORGS),
    themes: structuredClone(THEMES),
    sentiments: structuredClone(SENTIMENTS),
    inputTypes: structuredClone(INPUT_TYPES),
    inputRecords: structuredClone(INPUT_RECORDS),
    models: structuredClone(MODELS),
    rates: structuredClone(RATES),
    pipelines: [structuredClone(OFSTED_PIPELINE), structuredClone(NEWS_PIPELINE)],
    versions: [structuredClone(OFSTED_V1), ofstedV2Draft(), structuredClone(NEWS_V1)],
    requests: [],
    snapshots: [],
    attempts: [],
    executions: [],
    reviews: [],
    results: [],
    deliveries: [],
    audit: [],
    testCases: seedTestCases(),
    testRuns: [],
    testSnapshots: [],
    testAttempts: [],
    testExecutions: [],
  }
}

export async function buildSeed(nowMs = Date.now()): Promise<Db> {
  const db = emptyDb(toIso(nowMs))
  const access: DbAccess = { get: () => db, mutate: (fn) => fn(db) }
  const clock = virtualClock(nowMs)
  db.audit.push(
    { id: 'AUD-seed-1', at: OFSTED_V1.publishedAt as string, actorId: 'u-priya', kind: 'version_published', message: `Published V1; approved by ${OFSTED_V1.approvedBy}`, pipelineId: 'pl-ofsted', versionId: 'v-ofsted-1' },
    { id: 'AUD-seed-2', at: '2026-11-18T10:05:00.000Z', actorId: 'u-tom', kind: 'draft_created', message: 'Created draft V2 from V1', pipelineId: 'pl-ofsted', versionId: 'v-ofsted-2' },
    { id: 'AUD-seed-3', at: NEWS_V1.publishedAt as string, actorId: 'u-tom', kind: 'version_published', message: `Published V1; approved by ${NEWS_V1.approvedBy}`, pipelineId: 'pl-news', versionId: 'v-news-1' },
  )

  const sorted = [...PLAN].sort((a, b) => b.ago - a.ago)
  let seq = 1
  const reviewsToDecide: { requestId: string; item: PlanItem; at: number }[] = []
  for (const item of sorted) {
    const at = nowMs - item.ago * 60_000
    clock.set(at)
    const pipeline = item.pipeline === 'ofsted' ? OFSTED_PIPELINE : NEWS_PIPELINE
    const day = new Date(at).toISOString().slice(0, 10).replace(/-/g, '')
    const { request } = submitRequest(access, {
      pipelineKey: pipeline.key,
      orgId: item.org,
      submissionRef: `${item.pipeline === 'ofsted' ? 'athena-theme' : 'news-loader'}-${day}-${String(seq++).padStart(4, '0')}`,
      scenario: item.scenario,
      actorId: item.pipeline === 'ofsted' ? 'u-gareth' : 'system',
      at: toIso(at),
    })
    if (item.queueOnly) continue
    await clock.sleep(8_000 + (seq % 5) * 7_000)
    await processRequest(access, request.id, { clock, simulateLatency: false, workerId: 'worker-01', failDelivery: item.failDelivery })
    const after = db.requests.find((r) => r.id === request.id)
    if (after?.status === 'retry_scheduled' && item.resolveRetry && after.nextEligibleAt) {
      clock.set(Date.parse(after.nextEligibleAt) + 4_000)
      await processRequest(access, request.id, { clock, simulateLatency: false, workerId: 'worker-02' })
    }
    if (item.review && after?.status === 'awaiting_review') reviewsToDecide.push({ requestId: request.id, item, at: clock.now() })
  }

  for (const { requestId, item, at } of reviewsToDecide) {
    const review = db.reviews.find((r) => r.requestId === requestId && r.status === 'open')
    if (!review || !item.review) continue
    clock.set(at + item.review.afterMin * 60_000)
    const opts = { actorId: 'u-aisha', clock, simulateLatency: false }
    if (item.review.decision === 'edit') {
      const edited = { ...review.candidate, summary: String(review.candidate.summary ?? '').replace(UNSUPPORTED_CLAIM, '') }
      await decideReview(access, review.id, { kind: 'edit', output: edited, reason: item.review.reason }, opts)
    } else if (item.review.decision === 'reject') {
      await decideReview(access, review.id, { kind: 'reject', reason: item.review.reason }, opts)
    } else {
      await decideReview(access, review.id, { kind: 'approve', reason: item.review.reason }, opts)
    }
  }
  db.audit.sort((a, b) => (a.at < b.at ? -1 : 1))
  return db
}
