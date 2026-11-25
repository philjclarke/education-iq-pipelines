import type {
  AuditEvent,
  AuditKind,
  ID,
  InputRecord,
  InputSnapshot,
  InputTypeRef,
  ManualReview,
  ModelConfig,
  ModelRate,
  Organisation,
  Pipeline,
  PipelineRequest,
  PipelineResult,
  PipelineVersion,
  RequestAttempt,
  ResultDelivery,
  Sentiment,
  StepExecution,
  TestCase,
  TestRun,
  Theme,
  User,
} from '../domain/types'

export const DB_SCHEMA_VERSION = 3

/**
 * The prototype's whole database. Production and test records are kept in
 * separate collections so test activity never touches queue records,
 * results or destinations.
 */
export interface Db {
  schemaVersion: number
  seededAt: string
  counters: Record<string, number>
  currentUserId: ID
  settings: { athenaOutage: boolean }

  users: User[]
  orgs: Organisation[]
  themes: Theme[]
  sentiments: Sentiment[]
  inputTypes: InputTypeRef[]
  inputRecords: InputRecord[]
  models: ModelConfig[]
  rates: ModelRate[]

  pipelines: Pipeline[]
  versions: PipelineVersion[]

  requests: PipelineRequest[]
  snapshots: InputSnapshot[]
  attempts: RequestAttempt[]
  executions: StepExecution[]
  reviews: ManualReview[]
  results: PipelineResult[]
  deliveries: ResultDelivery[]
  audit: AuditEvent[]

  testCases: TestCase[]
  testRuns: TestRun[]
  testSnapshots: InputSnapshot[]
  testAttempts: RequestAttempt[]
  testExecutions: StepExecution[]
}

/** Read/write access to the database, used by services. */
export interface DbAccess {
  get(): Db
  mutate(fn: (db: Db) => void): void
}

const RANDOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function randomCode(n: number): string {
  let s = ''
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  for (const b of bytes) s += RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]
  return s
}

/** Human-facing sequential IDs for some prefixes, random IDs for the rest. */
export function nextId(db: Db, prefix: string): string {
  if (prefix === 'REQ' || prefix === 'RV' || prefix === 'TR') {
    const n = (db.counters[prefix] ?? (prefix === 'REQ' ? 10400 : 100)) + 1
    db.counters[prefix] = n
    return `${prefix}-${n}`
  }
  return `${prefix}-${randomCode(8)}`
}

export function addAudit(
  db: Db,
  e: { at: string; actorId: ID; kind: AuditKind; message: string } & Partial<Pick<AuditEvent, 'pipelineId' | 'versionId' | 'requestId' | 'stepId' | 'reviewId' | 'deliveryId'>>,
) {
  db.audit.push({ id: `AUD-${randomCode(8)}`, ...e })
}

export function upsert<T extends { id: ID }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id)
  if (i >= 0) list[i] = item
  else list.push(item)
}
