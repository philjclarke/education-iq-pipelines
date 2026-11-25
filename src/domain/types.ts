/**
 * Domain model for the EdIQ AI pipeline prototype.
 *
 * These types mirror the SQL Server data model in the brief (§1). For the
 * prototype, a pipeline version's configuration (inputs, steps, rules,
 * destination) is embedded in the version record and deep-copied when a
 * draft is created. Production would normalise these into tables keyed by
 * (VersionId, StepId) so a request cannot run a step from another version.
 */

export type ID = string
export type ISODate = string

// ───────────────────────────── Reference data ─────────────────────────────

export type UserRole = 'data_scientist' | 'reviewer' | 'operations'

export interface User {
  id: ID
  name: string
  role: UserRole
  initials: string
}

export type OrgKind = 'school' | 'trust' | 'college'

export interface Organisation {
  id: ID
  urn: string
  name: string
  kind: OrgKind
  phase: string
  localAuthority: string
  trustId?: ID
}

export interface Theme {
  id: ID
  code: string
  name: string
  description: string
}

export interface Sentiment {
  id: ID
  code: string
  label: string
  rank: number
}

/** Known `Inputs.TypeRef` values in the existing Inputs table. */
export interface InputTypeRef {
  code: string
  label: string
  source: 'Athena' | 'Atlas' | 'Loader'
  description: string
  dataType: InputDataType
}

/** A row in the existing EdIQ `Inputs` table (content snippets and facts). */
export interface InputRecord {
  id: ID // source row ID
  orgId: ID
  typeRef: string
  title: string
  content: string | null
  sourceUrl?: string
  publishedAt?: ISODate
  loadedAt: ISODate
  extraction: 'ok' | 'empty' | 'failed'
  /** For Atlas facts */
  metric?: string
  value?: string | number
  period?: string
}

export interface ModelConfig {
  id: ID
  provider: 'OpenAI' | 'Anthropic' | 'Azure OpenAI' | 'Google'
  modelId: string
  displayName: string
  supportsTemperature: boolean
  supportsReasoningEffort: boolean
  maxOutputTokens: number
  inputTokenBudget: number
  timeoutSec: number
  credentialRef: string
}

/** Rates are kept separately so cost estimates trace to the price used at the time. */
export interface ModelRate {
  id: ID
  modelConfigId: ID
  inputPerMTokGBP: number
  outputPerMTokGBP: number
  effectiveFrom: ISODate
  note?: string
}

// ───────────────────────────── Configuration ─────────────────────────────

export interface Pipeline {
  id: ID
  key: string
  name: string
  description: string
  ownerId: ID
  activeVersionId: ID | null
  createdAt: ISODate
  taskKind: 'evidence_summary' | 'classification' | 'extraction'
}

export type VersionState = 'draft' | 'published'

export type ExhaustionAction = 'fail' | 'manual_review'

export interface PipelineVersion {
  id: ID
  pipelineId: ID
  number: number
  state: VersionState
  authorId: ID
  createdAt: ISODate
  updatedAt: ISODate
  copiedFromVersionId?: ID
  publishedById?: ID
  publishedAt?: ISODate
  approvedBy?: string
  changeNote?: string
  maxRequestAttempts: number
  exhaustionAction: ExhaustionAction
  inputs: InputDefinition[]
  steps: Step[]
  entryStepId: ID | null
  /** The step whose structured output becomes the candidate / final result. */
  resultStepId: ID | null
  destination: DestinationMapping | null
}

export type InputDataType = 'text' | 'excerpt_list' | 'fact_list' | 'number' | 'json'

export interface InputDefinition {
  id: ID
  alias: string
  kind: 'fixed' | 'dynamic'
  dataType: InputDataType
  required: boolean
  description: string
  guidance: string
  fixedValue?: string
  typeRef?: string
}

export type StepType = 'generate' | 'validate' | 'check'

export type BindingRole = 'material' | 'candidate' | 'evidence' | 'context'

export type BindingSource =
  | { kind: 'input'; inputId: ID }
  | { kind: 'step_output'; stepId: ID; field: string }

export interface Binding {
  id: ID
  /** Name used for this value inside the prompt, e.g. {{inspection_evidence}} */
  name: string
  source: BindingSource
  role: BindingRole
  note: string
}

export type FieldType = 'string' | 'number' | 'boolean' | 'enum' | 'string_list' | 'object_list'

export interface OutputField {
  id: ID
  name: string
  type: FieldType
  required: boolean
  /** Only required when `outcome` equals one of these values (empty = always). */
  requiredForOutcomes?: string[]
  allowedValues?: string[]
  description: string
  min?: number
  max?: number
  itemFields?: OutputField[]
  /** Example value used in JSON preview. */
  example?: unknown
}

export interface PromptExample {
  id: ID
  label: string
  kind: 'good' | 'edge_case' | 'mistake'
  inputSummary: string
  response: string
  explanation: string
}

export interface Criterion {
  id: ID
  name: string
  instructions: string
}

export interface VerdictDef {
  value: string
  meaning: string
}

/** Answers to the Guided Prompt Builder questions, stored against each question. */
export interface PromptAnswers {
  role: string
  // Generation questions
  produce: string
  audience: string
  background: string
  inclusion: string[]
  evidenceRules: string[]
  uncertaintyOutcome: string
  uncertainty: string
  writing: string
  wordLimit: number | null
  examples: PromptExample[]
  // Validation questions
  criteria: Criterion[]
  seriousness: string
  verdicts: VerdictDef[]
  confidenceGuidance: string
}

export type CheckKind = 'word_count' | 'evidence_refs_valid' | 'required_present'

export interface CheckConfig {
  kind: CheckKind
  /** Binding name the check reads. */
  bindingName: string
  /** For word_count */
  maxWords?: number
  minWords?: number
  /** For evidence_refs_valid: inputs whose captured source row IDs are valid references. */
  evidenceInputIds?: ID[]
}

export interface ModelSettings {
  temperature: number
  maxOutputTokens: number
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface Step {
  id: ID
  code: string
  name: string
  type: StepType
  displayOrder: number
  modelConfigId: ID | null
  settings: ModelSettings
  bindings: Binding[]
  prompt: PromptAnswers
  outputSchema: OutputField[]
  checks: CheckConfig[]
  rules: RoutingRule[]
  defaultRoute: RouteAction
  maxInvocations: number | null
}

export const STANDARD_OUTCOMES = [
  'success',
  'invalid_output',
  'provider_error',
  'timeout',
  'insufficient_evidence',
  'check_failed',
] as const
export type StandardOutcome = (typeof STANDARD_OUTCOMES)[number]

export type Comparator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in' | 'contains' | 'is_empty' | 'not_empty'

export type Condition =
  | { id: ID; kind: 'outcome'; cmp: '=' | '!='; value: StandardOutcome }
  | { id: ID; kind: 'field'; field: string; cmp: Comparator; value: string | number | boolean | string[] | null }
  | { id: ID; kind: 'group'; op: 'AND' | 'OR'; items: Condition[] }

export type RouteAction =
  | { type: 'continue'; targetStepId: ID | null }
  | { type: 'complete' }
  | { type: 'retry_from'; targetStepId: ID | null; delaySec: number }
  | { type: 'fail'; reason: string }
  | { type: 'manual_review'; reason: string }

export interface RoutingRule {
  id: ID
  label: string
  when: Condition // root is always a group
  action: RouteAction
}

export interface DestinationFieldMap {
  id: ID
  target: string
  source: { kind: 'result_field'; field: string } | { kind: 'fixed'; value: string } | { kind: 'request'; field: 'orgId' | 'requestId' | 'versionNumber' }
}

export interface DestinationMapping {
  destination: 'athena'
  adapter: string
  description: string
  fields: DestinationFieldMap[]
  /** Result field holding evidence references, delivered as Evidence rows. */
  evidenceField: string | null
}

// ───────────────────────────── Execution ─────────────────────────────

export type RequestStatus =
  | 'queued'
  | 'in_progress'
  | 'retry_scheduled'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'missing_input'

export interface Lease {
  workerId: string
  token: string
  expiresAt: ISODate
}

export interface PipelineRequest {
  id: ID
  pipelineId: ID
  versionId: ID
  orgId: ID
  submissionRef: string
  status: RequestStatus
  currentStepId: ID | null
  attemptCount: number
  submittedAt: ISODate
  queuedAt: ISODate
  startedAt?: ISODate
  finishedAt?: ISODate
  nextEligibleAt?: ISODate
  lease?: Lease
  finalReason?: string
  missingInputs?: { alias: string; typeRef?: string; reason: string }[]
  reviewReason?: string
  /** Set while a retry or rerun is waiting for the worker. */
  pendingRetry?: { fromStepId: ID; trigger: AttemptTrigger; detail: string }
  /** Prototype only: which scripted response set the simulated provider uses. */
  scenario: string
}

export interface SnapshotItem {
  order: number
  sourceRowId: ID | null
  title: string
  content: string | null
  sourceUrl?: string
  capturedAt: ISODate
  usable: boolean
  issue?: string
}

export interface InputSnapshot {
  id: ID
  ownerId: ID // request or test run
  inputId: ID
  alias: string
  kind: 'fixed' | 'dynamic'
  typeRef?: string
  required: boolean
  status: 'captured' | 'missing' | 'partial'
  items: SnapshotItem[]
}

export type AttemptTrigger = 'initial' | 'retry_rule' | 'manual_rerun' | 'reviewer_rerun'

export interface RequestAttempt {
  id: ID
  ownerId: ID
  number: number
  versionId: ID
  startingStepId: ID
  trigger: AttemptTrigger
  triggerDetail?: string
  precedingAttemptId?: ID
  startedAt: ISODate
  finishedAt?: ISODate
  outcome: 'running' | 'completed' | 'retried' | 'failed' | 'manual_review' | 'interrupted'
}

export interface ResolvedInput {
  name: string
  role: BindingRole
  sourceLabel: string
  value: string
  sourceRowIds: ID[]
}

export interface CheckResult {
  name: string
  passed: boolean
  detail: string
}

export interface StepExecution {
  id: ID
  ownerId: ID
  attemptId: ID
  stepId: ID
  stepCode: string
  stepName: string
  stepType: StepType
  invocation: number
  status: 'running' | 'succeeded' | 'failed' | 'reused'
  reusedFromExecutionId?: ID
  model?: { provider: string; modelId: string; settings: ModelSettings }
  resolvedInputs: ResolvedInput[]
  renderedPrompt?: { system: string; user: string; outputSpec: string }
  rawOutput?: string
  structured?: Record<string, unknown>
  schemaErrors: string[]
  checks: CheckResult[]
  outcome?: StandardOutcome
  matchedRule?: { ruleId: ID | 'default'; label: string; position: number | null; explanation: string[] }
  action?: RouteAction
  startedAt: ISODate
  finishedAt?: ISODate
  durationMs?: number
  usage?: { inputTokens: number; outputTokens: number } | null
  costGBP?: number | null
  costNote?: string
  rateId?: ID
  error?: string
}

export interface ManualReview {
  id: ID
  requestId: ID
  attemptId: ID
  sourceStepId: ID
  sourceExecutionId: ID
  candidate: Record<string, unknown>
  reason: string
  createdAt: ISODate
  status: 'open' | 'resolved'
  decision?: 'approved' | 'edited_approved' | 'rejected' | 'rerun'
  reviewerId?: ID
  decisionReason?: string
  decidedAt?: ISODate
  editedOutput?: Record<string, unknown>
  rerunFromStepId?: ID
}

export interface PipelineResult {
  id: ID
  requestId: ID
  orgId: ID
  versionId: ID
  payload: Record<string, unknown>
  evidenceRefs: ID[]
  approval: { kind: 'automatic' | 'manual'; by: string; at: ISODate; reviewId?: ID; edited: boolean }
  createdAt: ISODate
}

export interface DeliveryAttempt {
  at: ISODate
  outcome: 'delivered' | 'failed'
  error?: string
  actorId: ID
}

export interface ResultDelivery {
  id: ID
  resultId: ID
  requestId: ID
  destination: 'athena'
  deliveryKey: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: DeliveryAttempt[]
  latestError?: string
  payload?: Record<string, unknown>
}

// ───────────────────────────── Testing ─────────────────────────────

export type Assertion =
  | { id: ID; kind: 'route'; expected: 'complete' | 'manual_review' | 'fail' | 'missing_input' }
  | { id: ID; kind: 'outcome'; stepCode: string; expected: StandardOutcome }
  | { id: ID; kind: 'field'; stepCode: string; field: string; cmp: Comparator; value: string | number | boolean | null }
  | { id: ID; kind: 'attempts'; cmp: '=' | '<=' | '>='; value: number }

export interface TestCase {
  id: ID
  pipelineId: ID
  name: string
  description: string
  orgId: ID | null
  /** Manually entered values by input alias, overriding seeded records. */
  manualInputs: Record<string, string>
  scenario: string
  assertions: Assertion[]
  createdAt: ISODate
}

export interface AssertionResult {
  assertionId: ID
  label: string
  passed: boolean
  expected: string
  actual: string
}

export interface TestRun {
  id: ID
  pipelineId: ID
  versionId: ID
  versionNumber: number
  /** Pinned copy of the configuration at the moment the test started. */
  pinnedConfig: PipelineVersion
  testCaseId: ID | null
  suiteRunId: ID | null
  label: string
  orgId: ID | null
  scenario: string
  startedAt: ISODate
  finishedAt?: ISODate
  status: 'running' | 'completed' | 'failed' | 'awaiting_review' | 'missing_input' | 'interrupted'
  finalReason?: string
  assertionResults: AssertionResult[]
  simulatedCostGBP: number
  startedBy: ID
}

// ───────────────────────────── Audit ─────────────────────────────

export type AuditKind =
  | 'pipeline_created'
  | 'draft_created'
  | 'version_published'
  | 'request_submitted'
  | 'request_claimed'
  | 'input_captured'
  | 'status_changed'
  | 'routed'
  | 'retry_scheduled'
  | 'review_created'
  | 'review_decided'
  | 'result_saved'
  | 'delivery_attempted'
  | 'lease_recovered'

export interface AuditEvent {
  id: ID
  at: ISODate
  actorId: ID
  kind: AuditKind
  message: string
  pipelineId?: ID
  versionId?: ID
  requestId?: ID
  stepId?: ID
  reviewId?: ID
  deliveryId?: ID
}
