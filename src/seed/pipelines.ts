import type {
  Condition,
  ModelConfig,
  ModelRate,
  OutputField,
  Pipeline,
  PipelineVersion,
  PromptAnswers,
  Step,
  TestCase,
} from '../domain/types'
import { THEMES } from './content'

export function blankAnswers(): PromptAnswers {
  return {
    role: '',
    produce: '',
    audience: '',
    background: '',
    inclusion: [],
    evidenceRules: [],
    uncertaintyOutcome: '',
    uncertainty: '',
    writing: '',
    wordLimit: null,
    examples: [],
    criteria: [],
    seriousness: '',
    verdicts: [],
    confidenceGuidance: '',
  }
}

export const MODELS: ModelConfig[] = [
  { id: 'm-gpt41', provider: 'OpenAI', modelId: 'gpt-4.1', displayName: 'GPT-4.1', supportsTemperature: true, supportsReasoningEffort: false, maxOutputTokens: 4096, inputTokenBudget: 120000, timeoutSec: 60, credentialRef: 'kv://ediq-ai/openai-primary' },
  { id: 'm-gpt41mini', provider: 'OpenAI', modelId: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', supportsTemperature: true, supportsReasoningEffort: false, maxOutputTokens: 4096, inputTokenBudget: 120000, timeoutSec: 45, credentialRef: 'kv://ediq-ai/openai-primary' },
  { id: 'm-sonnet', provider: 'Anthropic', modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', supportsTemperature: true, supportsReasoningEffort: true, maxOutputTokens: 4096, inputTokenBudget: 180000, timeoutSec: 30, credentialRef: 'kv://ediq-ai/anthropic' },
  { id: 'm-gemini', provider: 'Google', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportsTemperature: true, supportsReasoningEffort: true, maxOutputTokens: 4096, inputTokenBudget: 900000, timeoutSec: 60, credentialRef: 'kv://ediq-ai/google' },
  { id: 'm-azure4o', provider: 'Azure OpenAI', modelId: 'gpt-4o (uksouth)', displayName: 'GPT-4o · Azure UK South', supportsTemperature: true, supportsReasoningEffort: false, maxOutputTokens: 4096, inputTokenBudget: 120000, timeoutSec: 60, credentialRef: 'kv://ediq-ai/azure-uksouth' },
]

/** Illustrative rates only. Gemini deliberately has no rate, to show the “pricing unavailable” flag. */
export const RATES: ModelRate[] = [
  { id: 'rate-gpt41-2026a', modelConfigId: 'm-gpt41', inputPerMTokGBP: 1.6, outputPerMTokGBP: 6.4, effectiveFrom: '2026-01-01T00:00:00.000Z', note: 'Illustrative' },
  { id: 'rate-gpt41mini-2026a', modelConfigId: 'm-gpt41mini', inputPerMTokGBP: 0.32, outputPerMTokGBP: 1.28, effectiveFrom: '2026-01-01T00:00:00.000Z', note: 'Illustrative' },
  { id: 'rate-sonnet-2026a', modelConfigId: 'm-sonnet', inputPerMTokGBP: 2.4, outputPerMTokGBP: 12, effectiveFrom: '2026-01-01T00:00:00.000Z', note: 'Illustrative' },
  { id: 'rate-azure4o-2026a', modelConfigId: 'm-azure4o', inputPerMTokGBP: 2, outputPerMTokGBP: 8, effectiveFrom: '2026-01-01T00:00:00.000Z', note: 'Illustrative' },
]

const g = (id: string, op: 'AND' | 'OR', items: Condition[]): Condition => ({ id, kind: 'group', op, items })

const VERDICT_FIELDS = (): OutputField[] => [
  { id: 'f-verdict', name: 'verdict', type: 'enum', required: true, allowedValues: ['pass', 'correctable_issue', 'material_error'], description: 'Overall verdict' },
  { id: 'f-conf', name: 'confidence', type: 'number', required: true, min: 0, max: 1, description: 'Certainty in the verdict, 0–1', example: 0.86 },
  {
    id: 'f-findings',
    name: 'findings',
    type: 'object_list',
    required: false,
    description: 'One entry per problem found',
    itemFields: [
      { id: 'fi-crit', name: 'criterion', type: 'string', required: true, description: 'Criterion the finding relates to' },
      { id: 'fi-sev', name: 'severity', type: 'enum', required: true, allowedValues: ['minor', 'correctable', 'material'], description: 'How serious it is' },
      { id: 'fi-claim', name: 'claim', type: 'string', required: true, description: 'The affected claim' },
      { id: 'fi-ref', name: 'source_ref', type: 'string', required: false, description: 'Relevant source ID' },
      { id: 'fi-exp', name: 'explanation', type: 'string', required: true, description: 'Why this is a problem' },
    ],
  },
]

const VERDICTS = [
  { value: 'pass', meaning: 'All criteria are met. Minor style points may be noted in findings.' },
  { value: 'correctable_issue', meaning: 'One or more issues that regenerating the summary can fix without new evidence.' },
  { value: 'material_error', meaning: 'At least one claim is unsupported or materially wrong.' },
]

const SERIOUSNESS =
  'Awkward wording, a missing nuance or a slightly overstated adjective is a correctable issue. A claim with no supporting excerpt, a finding attributed to the wrong school or phase, or a reversed judgement is a material error.'

export const OFSTED_PIPELINE: Pipeline = {
  id: 'pl-ofsted',
  key: 'pk_ofsted_careers_7Q4M2XK9',
  name: 'Ofsted theme summary: careers provision',
  description:
    'Summarises what Ofsted says about a school’s careers provision, rates it on the EdIQ sentiment scale, checks every claim against the excerpts and sends uncertain results for a second review or to a person.',
  ownerId: 'u-priya',
  activeVersionId: 'v-ofsted-1',
  createdAt: '2026-09-15T09:12:00.000Z',
  taskKind: 'evidence_summary',
}

function ofstedSteps(): Step[] {
  const select: Step = {
    id: 'st-select',
    code: 'select_evidence',
    name: 'Select relevant evidence',
    type: 'generate',
    displayOrder: 1,
    modelConfigId: 'm-gpt41mini',
    settings: { temperature: 0, maxOutputTokens: 800 },
    bindings: [
      { id: 'b-sel-ofs', name: 'inspection_evidence', source: { kind: 'input', inputId: 'in-ofsted' }, role: 'material', note: 'Ofsted excerpts for this school. Choose the ones that discuss the theme.' },
      { id: 'b-sel-theme', name: 'theme_definition', source: { kind: 'input', inputId: 'in-theme' }, role: 'context', note: 'Defines what counts as relevant.' },
    ],
    prompt: {
      ...blankAnswers(),
      role: 'You are an education research analyst at Education IQ.',
      produce: 'Identify which of the supplied Ofsted excerpts are relevant to the theme for this school, and return their source IDs.',
      audience: 'The next step uses your selection to write a summary, so include every excerpt that could support a finding about the theme, and nothing else.',
      background: 'Use this definition to decide what counts as relevant:\n{{theme_definition}}',
      inclusion: [
        'Include excerpts that describe careers education, employer encounters, guidance or destinations.',
        'Exclude excerpts about pastoral support, behaviour or reading unless they explicitly mention careers.',
      ],
      evidenceRules: ['Return only source IDs that appear in the supplied excerpts.'],
      uncertaintyOutcome: 'insufficient_evidence',
      uncertainty: 'If no excerpt is relevant to the theme, return no IDs and explain briefly what the excerpts do cover.',
      writing: 'Keep the relevance note to one sentence.',
    },
    outputSchema: [
      { id: 'f-sel-refs', name: 'relevant_refs', type: 'string_list', required: true, requiredForOutcomes: ['relevant_found'], description: 'Source IDs of relevant excerpts', example: ['OFS-20411', 'OFS-20412'] },
      { id: 'f-sel-note', name: 'relevance_note', type: 'string', required: false, description: 'One sentence on what was selected' },
      { id: 'f-sel-out', name: 'outcome', type: 'enum', required: true, allowedValues: ['relevant_found', 'insufficient_evidence'], description: 'Whether relevant evidence was found' },
      { id: 'f-sel-reason', name: 'reason', type: 'string', required: true, requiredForOutcomes: ['insufficient_evidence'], description: 'Why the evidence is insufficient' },
    ],
    checks: [],
    rules: [
      { id: 'r-sel-1', label: 'No relevant evidence', when: g('c-sel-1', 'AND', [{ id: 'c-sel-1a', kind: 'outcome', cmp: '=', value: 'insufficient_evidence' }]), action: { type: 'fail', reason: 'Insufficient relevant evidence' } },
      { id: 'r-sel-2', label: 'Malformed output', when: g('c-sel-2', 'AND', [{ id: 'c-sel-2a', kind: 'outcome', cmp: '=', value: 'invalid_output' }]), action: { type: 'retry_from', targetStepId: 'st-select', delaySec: 0 } },
    ],
    defaultRoute: { type: 'continue', targetStepId: 'st-generate' },
    maxInvocations: 2,
  }

  const generate: Step = {
    id: 'st-generate',
    code: 'generate_summary',
    name: 'Generate summary',
    type: 'generate',
    displayOrder: 2,
    modelConfigId: 'm-gpt41',
    settings: { temperature: 0.2, maxOutputTokens: 600 },
    bindings: [
      { id: 'b-gen-ofs', name: 'inspection_evidence', source: { kind: 'input', inputId: 'in-ofsted' }, role: 'material', note: 'The factual source for every claim.' },
      { id: 'b-gen-sel', name: 'selected_refs', source: { kind: 'step_output', stepId: 'st-select', field: 'relevant_refs' }, role: 'material', note: 'Source IDs judged relevant to the theme. Focus on these excerpts.' },
      { id: 'b-gen-theme', name: 'theme_definition', source: { kind: 'input', inputId: 'in-theme' }, role: 'context', note: '' },
      { id: 'b-gen-scale', name: 'sentiment_scale', source: { kind: 'input', inputId: 'in-scale' }, role: 'context', note: '' },
    ],
    prompt: {
      ...blankAnswers(),
      role: 'You are an education analyst writing for Education IQ. You write accurate, evidence-based summaries of school inspection findings.',
      produce: 'Write one summary of careers provision for one school, based on the supplied inspection excerpts, and rate the provision on the sentiment scale.',
      audience:
        'An EdIQ user needs to understand the school’s careers provision quickly and see the evidence behind the summary. Partnerships teams use it to judge whether a school might benefit from careers support.',
      background: 'Careers provision is defined as follows:\n{{theme_definition}}\n\nRate the provision using this scale:\n{{sentiment_scale}}',
      inclusion: [
        'Prioritise specific findings about careers provision.',
        'Where the evidence supports it, cover both strengths and areas for improvement.',
        'Distinguish an observation from an inference.',
      ],
      evidenceRules: [
        'Each substantive claim must be supported by a supplied excerpt. Return its source ID in evidence_refs.',
        'Where excerpts disagree, describe the difference if it affects the conclusion.',
      ],
      uncertaintyOutcome: 'insufficient_evidence',
      uncertainty: 'If the excerpts say nothing about careers provision, do not write a summary. Explain briefly what the excerpts do cover.',
      writing: 'Use neutral UK English. Write a short paragraph. Avoid generic praise and recommendations.',
      wordLimit: 100,
      examples: [
        {
          id: 'ex-gen-1',
          label: 'Well-evidenced summary',
          kind: 'good',
          inputSummary: 'Three excerpts describing a careers programme, employer encounters in every year and Year 11 guidance interviews.',
          response: '{"summary": "Pupils meet employers in every year and receive an impartial guidance interview before the end of Year 11. Inspectors noted that encounters are not yet adapted for some pupils with SEND.", "sentiment": "good", "evidence_refs": ["OFS-1", "OFS-2"], "outcome": "summary_written"}',
          explanation: 'Each sentence maps to a cited excerpt, it covers a strength and an area for improvement, and the rating follows the scale.',
        },
        {
          id: 'ex-gen-2',
          label: 'Pastoral support but no careers evidence',
          kind: 'edge_case',
          inputSummary: 'Excerpts discuss pastoral support and reading but say nothing about careers provision.',
          response: '{"outcome": "insufficient_evidence", "reason": "The excerpts cover pastoral support and reading only."}',
          explanation: 'Pastoral support is not careers provision. Return insufficient_evidence rather than stretching the evidence.',
        },
      ],
    },
    outputSchema: [
      { id: 'f-gen-sum', name: 'summary', type: 'string', required: true, requiredForOutcomes: ['summary_written'], description: 'The summary paragraph' },
      { id: 'f-gen-sent', name: 'sentiment', type: 'enum', required: true, requiredForOutcomes: ['summary_written'], allowedValues: ['strong', 'good', 'mixed', 'weak', 'poor'], description: 'Rating on the EdIQ sentiment scale' },
      { id: 'f-gen-refs', name: 'evidence_refs', type: 'string_list', required: true, requiredForOutcomes: ['summary_written'], description: 'Source IDs supporting the summary', example: ['OFS-20411'] },
      { id: 'f-gen-out', name: 'outcome', type: 'enum', required: true, allowedValues: ['summary_written', 'insufficient_evidence'], description: 'Whether a summary was written' },
      { id: 'f-gen-reason', name: 'reason', type: 'string', required: true, requiredForOutcomes: ['insufficient_evidence'], description: 'Why no summary was written' },
    ],
    checks: [],
    rules: [
      { id: 'r-gen-1', label: 'Insufficient evidence', when: g('c-gen-1', 'AND', [{ id: 'c-gen-1a', kind: 'outcome', cmp: '=', value: 'insufficient_evidence' }]), action: { type: 'fail', reason: 'Insufficient relevant evidence' } },
      { id: 'r-gen-2', label: 'Malformed output', when: g('c-gen-2', 'AND', [{ id: 'c-gen-2a', kind: 'outcome', cmp: '=', value: 'invalid_output' }]), action: { type: 'retry_from', targetStepId: 'st-generate', delaySec: 0 } },
    ],
    defaultRoute: { type: 'continue', targetStepId: 'st-check' },
    maxInvocations: 3,
  }

  const check: Step = {
    id: 'st-check',
    code: 'check_summary',
    name: 'Check length and references',
    type: 'check',
    displayOrder: 3,
    modelConfigId: null,
    settings: { temperature: 0, maxOutputTokens: 0 },
    bindings: [
      { id: 'b-chk-sum', name: 'summary', source: { kind: 'step_output', stepId: 'st-generate', field: 'summary' }, role: 'candidate', note: '' },
      { id: 'b-chk-refs', name: 'evidence_refs', source: { kind: 'step_output', stepId: 'st-generate', field: 'evidence_refs' }, role: 'candidate', note: '' },
    ],
    prompt: blankAnswers(),
    outputSchema: [],
    checks: [
      { kind: 'word_count', bindingName: 'summary', maxWords: 100 },
      { kind: 'evidence_refs_valid', bindingName: 'evidence_refs', evidenceInputIds: ['in-ofsted'] },
    ],
    rules: [
      { id: 'r-chk-1', label: 'A check failed', when: g('c-chk-1', 'AND', [{ id: 'c-chk-1a', kind: 'field', field: 'passed', cmp: '=', value: false }]), action: { type: 'retry_from', targetStepId: 'st-generate', delaySec: 0 } },
    ],
    defaultRoute: { type: 'continue', targetStepId: 'st-validate' },
    maxInvocations: null,
  }

  const validate: Step = {
    id: 'st-validate',
    code: 'validate_claims',
    name: 'Validate claims against evidence',
    type: 'validate',
    displayOrder: 4,
    modelConfigId: 'm-sonnet',
    settings: { temperature: 0, maxOutputTokens: 1000, reasoningEffort: 'medium' },
    bindings: [
      { id: 'b-val-sum', name: 'candidate_summary', source: { kind: 'step_output', stepId: 'st-generate', field: 'summary' }, role: 'candidate', note: '' },
      { id: 'b-val-refs', name: 'candidate_refs', source: { kind: 'step_output', stepId: 'st-generate', field: 'evidence_refs' }, role: 'candidate', note: '' },
      { id: 'b-val-ofs', name: 'inspection_evidence', source: { kind: 'input', inputId: 'in-ofsted' }, role: 'evidence', note: '' },
      { id: 'b-val-theme', name: 'theme_definition', source: { kind: 'input', inputId: 'in-theme' }, role: 'context', note: '' },
    ],
    prompt: {
      ...blankAnswers(),
      role: 'You are a careful fact-checker for Education IQ. You check summaries against the source evidence and report problems precisely.',
      criteria: [
        { id: 'cr-1', name: 'Claims supported by evidence', instructions: 'Every substantive claim in the summary must be supported by at least one supplied excerpt.' },
        { id: 'cr-2', name: 'Material findings represented accurately', instructions: 'Findings must not be overstated, understated, or attributed to the wrong school or phase.' },
        { id: 'cr-3', name: 'Evidence references support the associated claims', instructions: 'Each cited source ID must contain the evidence for the claim it supports.' },
      ],
      seriousness: SERIOUSNESS,
      verdicts: VERDICTS,
      confidenceGuidance:
        'Confidence is your certainty in the verdict, from 0 to 1. Use 0.8 or above only when every claim is directly supported. Lower it when evidence is indirect or wording is borderline.',
    },
    outputSchema: VERDICT_FIELDS(),
    checks: [],
    rules: [
      {
        id: 'r-val-1',
        label: 'Confident pass',
        when: g('c-val-1', 'AND', [
          { id: 'c-val-1a', kind: 'field', field: 'verdict', cmp: '=', value: 'pass' },
          { id: 'c-val-1b', kind: 'field', field: 'confidence', cmp: '>=', value: 0.8 },
        ]),
        action: { type: 'complete' },
      },
      { id: 'r-val-2', label: 'Low-confidence pass', when: g('c-val-2', 'AND', [{ id: 'c-val-2a', kind: 'field', field: 'verdict', cmp: '=', value: 'pass' }]), action: { type: 'continue', targetStepId: 'st-second' } },
      { id: 'r-val-3', label: 'Correctable issue', when: g('c-val-3', 'AND', [{ id: 'c-val-3a', kind: 'field', field: 'verdict', cmp: '=', value: 'correctable_issue' }]), action: { type: 'retry_from', targetStepId: 'st-generate', delaySec: 0 } },
      { id: 'r-val-4', label: 'Material error', when: g('c-val-4', 'AND', [{ id: 'c-val-4a', kind: 'field', field: 'verdict', cmp: '=', value: 'material_error' }]), action: { type: 'manual_review', reason: 'Validator found a material error' } },
      {
        id: 'r-val-5',
        label: 'Provider problem',
        when: g('c-val-5', 'OR', [
          { id: 'c-val-5a', kind: 'outcome', cmp: '=', value: 'provider_error' },
          { id: 'c-val-5b', kind: 'outcome', cmp: '=', value: 'timeout' },
        ]),
        action: { type: 'retry_from', targetStepId: 'st-validate', delaySec: 60 },
      },
    ],
    defaultRoute: { type: 'manual_review', reason: 'Validator output could not be used' },
    maxInvocations: 3,
  }

  const second: Step = {
    id: 'st-second',
    code: 'second_review',
    name: 'Second review',
    type: 'validate',
    displayOrder: 5,
    modelConfigId: 'm-gemini',
    settings: { temperature: 0, maxOutputTokens: 1000, reasoningEffort: 'high' },
    bindings: [
      { id: 'b-sec-sum', name: 'candidate_summary', source: { kind: 'step_output', stepId: 'st-generate', field: 'summary' }, role: 'candidate', note: '' },
      { id: 'b-sec-ofs', name: 'inspection_evidence', source: { kind: 'input', inputId: 'in-ofsted' }, role: 'evidence', note: '' },
      { id: 'b-sec-find', name: 'first_findings', source: { kind: 'step_output', stepId: 'st-validate', field: 'findings' }, role: 'context', note: 'Findings from the first validator. Confirm or reject each one.' },
    ],
    prompt: {
      ...blankAnswers(),
      role: 'You are a senior reviewer at Education IQ. A first validator passed this summary with low confidence. Decide whether it can be published as written.',
      criteria: [
        { id: 'cr-s1', name: 'Material findings represented accurately', instructions: 'Findings must not be overstated, understated, or attributed to the wrong school or phase.' },
        { id: 'cr-s2', name: 'Neutral, evidence-led wording', instructions: 'Wording must not overstate the evidence or read like an inspection grade.' },
      ],
      seriousness: SERIOUSNESS,
      verdicts: VERDICTS,
      confidenceGuidance: 'Confidence is your certainty in the verdict, from 0 to 1.',
    },
    outputSchema: VERDICT_FIELDS(),
    checks: [],
    rules: [
      { id: 'r-sec-1', label: 'Pass', when: g('c-sec-1', 'AND', [{ id: 'c-sec-1a', kind: 'field', field: 'verdict', cmp: '=', value: 'pass' }]), action: { type: 'complete' } },
      { id: 'r-sec-2', label: 'Correctable issue', when: g('c-sec-2', 'AND', [{ id: 'c-sec-2a', kind: 'field', field: 'verdict', cmp: '=', value: 'correctable_issue' }]), action: { type: 'retry_from', targetStepId: 'st-generate', delaySec: 0 } },
      { id: 'r-sec-3', label: 'Material error', when: g('c-sec-3', 'AND', [{ id: 'c-sec-3a', kind: 'field', field: 'verdict', cmp: '=', value: 'material_error' }]), action: { type: 'manual_review', reason: 'Second reviewer found a material error' } },
    ],
    defaultRoute: { type: 'manual_review', reason: 'Second review was inconclusive' },
    maxInvocations: 2,
  }
  return [select, generate, check, validate, second]
}

const THEME_DEFINITION =
  'Careers provision covers careers education, information, advice and guidance: how the school helps pupils learn about the world of work, meet employers and training providers, receive impartial guidance, and move on to suitable education, employment or training. It includes provider access arrangements and adapted support for pupils with SEND. It does not include general pastoral support or enrichment unless the evidence links it to careers.'

const SENTIMENT_SCALE = [
  'strong: consistently high-quality provision with no material weaknesses noted',
  'good: effective provision with minor areas to develop',
  'mixed: clear strengths alongside notable weaknesses',
  'weak: provision is limited or poorly coordinated',
  'poor: inspectors identify serious failings',
].join('\n')

export const OFSTED_V1: PipelineVersion = {
  id: 'v-ofsted-1',
  pipelineId: 'pl-ofsted',
  number: 1,
  state: 'published',
  authorId: 'u-priya',
  createdAt: '2026-09-15T09:12:00.000Z',
  updatedAt: '2026-10-01T14:40:00.000Z',
  publishedById: 'u-priya',
  publishedAt: '2026-10-01T14:45:00.000Z',
  approvedBy: 'Helen Marsh (Head of Data Services)',
  changeNote: 'First release for the careers provision theme.',
  maxRequestAttempts: 3,
  exhaustionAction: 'manual_review',
  inputs: [
    { id: 'in-theme', alias: 'theme_definition', kind: 'fixed', dataType: 'text', required: true, description: 'Definition of the careers provision theme', guidance: 'Use to decide what is relevant. Not evidence about the school.', fixedValue: THEME_DEFINITION },
    { id: 'in-scale', alias: 'sentiment_scale', kind: 'fixed', dataType: 'text', required: true, description: 'EdIQ five-point sentiment scale', guidance: 'Defines each Athena sentiment value.', fixedValue: SENTIMENT_SCALE },
    { id: 'in-ofsted', alias: 'inspection_evidence', kind: 'dynamic', dataType: 'excerpt_list', required: true, description: 'Ofsted report excerpts for the request’s organisation', guidance: 'The factual source for every claim.', typeRef: 'Ofsted' },
    { id: 'in-web', alias: 'website_evidence', kind: 'dynamic', dataType: 'excerpt_list', required: false, description: 'Text from the school’s website', guidance: 'Self-reported. Do not treat as inspection evidence.', typeRef: 'SchoolWebsite' },
  ],
  steps: ofstedSteps(),
  entryStepId: 'st-select',
  resultStepId: 'st-generate',
  destination: {
    destination: 'athena',
    adapter: 'AthenaInsightAdapter (simulated)',
    description: 'Writes one Insight per completed request, with an Evidence row for each cited content snippet.',
    fields: [
      { id: 'dm-1', target: 'Insight.OrgId', source: { kind: 'request', field: 'orgId' } },
      { id: 'dm-2', target: 'Insight.ThemeId', source: { kind: 'fixed', value: 'careers_provision' } },
      { id: 'dm-3', target: 'Insight.SentimentId', source: { kind: 'result_field', field: 'sentiment' } },
      { id: 'dm-4', target: 'Insight.Statement', source: { kind: 'result_field', field: 'summary' } },
      { id: 'dm-5', target: 'Insight.SourcePipelineVersion', source: { kind: 'request', field: 'versionNumber' } },
    ],
    evidenceField: 'evidence_refs',
  },
}

/** V2 draft: adds Atlas destination facts as optional context. */
export function ofstedV2Draft(): PipelineVersion {
  const v: PipelineVersion = structuredClone(OFSTED_V1)
  v.id = 'v-ofsted-2'
  v.number = 2
  v.state = 'draft'
  v.authorId = 'u-tom'
  v.createdAt = '2026-11-18T10:05:00.000Z'
  v.updatedAt = '2026-11-20T16:22:00.000Z'
  v.copiedFromVersionId = 'v-ofsted-1'
  delete v.publishedAt
  delete v.publishedById
  delete v.approvedBy
  v.changeNote = 'Add Atlas destination facts as optional context for the summary.'
  v.inputs.push({ id: 'in-dest', alias: 'destination_facts', kind: 'dynamic', dataType: 'fact_list', required: false, description: 'Atlas facts on pupil destinations after KS4', guidance: 'Context only. Do not draw conclusions from a single figure.', typeRef: 'Atlas:Destinations' })
  const gen = v.steps.find((s) => s.id === 'st-generate') as Step
  gen.bindings.splice(2, 0, { id: 'b-gen-dest', name: 'destination_facts', source: { kind: 'input', inputId: 'in-dest' }, role: 'context', note: 'Atlas facts about pupil destinations. Use only as context; do not cite them as evidence of provision.' })
  return v
}

export const NEWS_PIPELINE: Pipeline = {
  id: 'pl-news',
  key: 'pk_news_classify_3HD8LW2P',
  name: 'News classification',
  description: 'Classifies news articles about an organisation by EdIQ theme and sentiment, for Athena.',
  ownerId: 'u-tom',
  activeVersionId: 'v-news-1',
  createdAt: '2026-10-08T11:00:00.000Z',
  taskKind: 'classification',
}

export const NEWS_V1: PipelineVersion = {
  id: 'v-news-1',
  pipelineId: 'pl-news',
  number: 1,
  state: 'published',
  authorId: 'u-tom',
  createdAt: '2026-10-08T11:00:00.000Z',
  updatedAt: '2026-10-09T15:00:00.000Z',
  publishedById: 'u-tom',
  publishedAt: '2026-10-09T15:10:00.000Z',
  approvedBy: 'Helen Marsh (Head of Data Services)',
  changeNote: 'Initial classifier.',
  maxRequestAttempts: 2,
  exhaustionAction: 'fail',
  inputs: [
    { id: 'in-article', alias: 'article', kind: 'dynamic', dataType: 'excerpt_list', required: true, description: 'News articles matched to the organisation', guidance: 'Classify the most recent article.', typeRef: 'News' },
    { id: 'in-themes', alias: 'theme_list', kind: 'fixed', dataType: 'text', required: true, description: 'EdIQ theme codes', guidance: '', fixedValue: THEMES.map((t) => `${t.code}: ${t.description}`).join('\n') },
  ],
  steps: [
    {
      id: 'st-classify',
      code: 'classify_article',
      name: 'Classify article',
      type: 'generate',
      displayOrder: 1,
      modelConfigId: 'm-azure4o',
      settings: { temperature: 0, maxOutputTokens: 400 },
      bindings: [
        { id: 'b-cl-art', name: 'article', source: { kind: 'input', inputId: 'in-article' }, role: 'material', note: 'The article to classify.' },
        { id: 'b-cl-th', name: 'theme_list', source: { kind: 'input', inputId: 'in-themes' }, role: 'context', note: '' },
      ],
      prompt: {
        ...blankAnswers(),
        role: 'You classify education news for Education IQ.',
        produce: 'Classify the most recent supplied news article by the single EdIQ theme it best fits, and rate its sentiment for the organisation.',
        audience: 'Athena uses the classification to attach news to the right theme on the organisation’s profile.',
        background: 'Themes:\n{{theme_list}}',
        inclusion: ['Choose the theme the article is mainly about, not one it mentions in passing.'],
        evidenceRules: ['Return the source ID of the article you classified as article_ref.'],
        writing: 'Give a one-sentence rationale.',
      },
      outputSchema: [
        { id: 'f-cl-theme', name: 'theme', type: 'enum', required: true, allowedValues: THEMES.map((t) => t.code), description: 'Best-fit theme code' },
        { id: 'f-cl-sent', name: 'sentiment', type: 'enum', required: true, allowedValues: ['strong', 'good', 'mixed', 'weak', 'poor'], description: 'Sentiment for the organisation' },
        { id: 'f-cl-rel', name: 'relevance', type: 'number', required: true, min: 0, max: 1, description: 'How clearly the article fits the theme', example: 0.82 },
        { id: 'f-cl-rat', name: 'rationale', type: 'string', required: true, description: 'One-sentence rationale' },
        { id: 'f-cl-ref', name: 'article_ref', type: 'string', required: true, description: 'Source ID of the article' },
      ],
      checks: [],
      rules: [
        { id: 'r-cl-1', label: 'Low relevance', when: g('c-cl-1', 'AND', [{ id: 'c-cl-1a', kind: 'field', field: 'relevance', cmp: '<', value: 0.75 }]), action: { type: 'manual_review', reason: 'Low relevance: check the classification' } },
        { id: 'r-cl-2', label: 'Malformed output', when: g('c-cl-2', 'AND', [{ id: 'c-cl-2a', kind: 'outcome', cmp: '=', value: 'invalid_output' }]), action: { type: 'retry_from', targetStepId: 'st-classify', delaySec: 0 } },
      ],
      defaultRoute: { type: 'complete' },
      maxInvocations: 2,
    },
  ],
  entryStepId: 'st-classify',
  resultStepId: 'st-classify',
  destination: {
    destination: 'athena',
    adapter: 'AthenaInsightAdapter (simulated)',
    description: 'Writes a news-derived Insight against the organisation.',
    fields: [
      { id: 'dn-1', target: 'Insight.OrgId', source: { kind: 'request', field: 'orgId' } },
      { id: 'dn-2', target: 'Insight.ThemeId', source: { kind: 'result_field', field: 'theme' } },
      { id: 'dn-3', target: 'Insight.SentimentId', source: { kind: 'result_field', field: 'sentiment' } },
      { id: 'dn-4', target: 'Insight.Statement', source: { kind: 'result_field', field: 'rationale' } },
    ],
    evidenceField: null,
  },
}

export function seedTestCases(): TestCase[] {
  const at = '2026-11-18T11:00:00.000Z'
  return [
    {
      id: 'tc-well',
      pipelineId: 'pl-ofsted',
      name: 'Well-supported summary',
      description: 'Millbrook School: relevant excerpts that clearly support a “good” rating.',
      orgId: 'org-millbrook',
      manualInputs: {},
      scenario: 'well_supported',
      assertions: [
        { id: 'a1', kind: 'route', expected: 'complete' },
        { id: 'a2', kind: 'field', stepCode: 'generate_summary', field: 'sentiment', cmp: '=', value: 'good' },
        { id: 'a3', kind: 'outcome', stepCode: 'validate_claims', expected: 'success' },
        { id: 'a4', kind: 'attempts', cmp: '=', value: 1 },
      ],
      createdAt: at,
    },
    {
      id: 'tc-insufficient',
      pipelineId: 'pl-ofsted',
      name: 'Insufficient relevant evidence',
      description: 'Oakfield Primary: excerpts exist but cover behaviour, pastoral support and reading only.',
      orgId: 'org-oakfield',
      manualInputs: {},
      scenario: 'insufficient',
      assertions: [
        { id: 'a1', kind: 'route', expected: 'fail' },
        { id: 'a2', kind: 'outcome', stepCode: 'select_evidence', expected: 'insufficient_evidence' },
      ],
      createdAt: at,
    },
    {
      id: 'tc-unsupported',
      pipelineId: 'pl-ofsted',
      name: 'No unsupported claims reach the validator',
      description: 'Fenwick Park: the generator tends to add an accreditation claim that no excerpt supports. This case fails until the prompt prevents it.',
      orgId: 'org-fenwick',
      manualInputs: {},
      scenario: 'unsupported_claim',
      assertions: [
        { id: 'a1', kind: 'field', stepCode: 'validate_claims', field: 'verdict', cmp: '!=', value: 'material_error' },
        { id: 'a2', kind: 'route', expected: 'complete' },
      ],
      createdAt: at,
    },
    {
      id: 'tc-lowconf',
      pipelineId: 'pl-ofsted',
      name: 'Low-confidence pass goes to second review',
      description: 'Harbour View (the worked example): validator passes at 0.74, second reviewer flags wording, generation retries.',
      orgId: 'org-harbour',
      manualInputs: {},
      scenario: 'worked_example',
      assertions: [
        { id: 'a1', kind: 'route', expected: 'complete' },
        { id: 'a2', kind: 'field', stepCode: 'second_review', field: 'verdict', cmp: '=', value: 'correctable_issue' },
        { id: 'a3', kind: 'attempts', cmp: '=', value: 2 },
      ],
      createdAt: at,
    },
    {
      id: 'tc-long',
      pipelineId: 'pl-ofsted',
      name: 'Over-long draft is regenerated',
      description: 'Kingsmead Academy: the first draft exceeds 100 words, so the deterministic check sends it back.',
      orgId: 'org-kingsmead',
      manualInputs: {},
      scenario: 'too_long',
      assertions: [
        { id: 'a1', kind: 'route', expected: 'complete' },
        { id: 'a2', kind: 'attempts', cmp: '=', value: 2 },
      ],
      createdAt: at,
    },
  ]
}

/** Default simulation scenario for new submissions, by organisation. */
export const ORG_DEFAULT_SCENARIO: Record<string, string> = {
  'org-harbour': 'worked_example',
  'org-millbrook': 'well_supported',
  'org-staidans': 'well_supported',
  'org-fenwick': 'unsupported_claim',
  'org-oakfield': 'insufficient',
  'org-riverside': 'well_supported',
  'org-kingsmead': 'too_long',
  'org-ashcombe': 'provider_error',
  'org-thornbury': 'invalid_json',
}
