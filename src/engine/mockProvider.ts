/**
 * Simulated model provider.
 *
 * Generation steps follow a scripted scenario (by organisation and invocation)
 * so test cases are repeatable. Validators are content-driven: they inspect the
 * candidate they were actually given, so a prompt change that removes a bad
 * claim produces a different verdict. Routing is always computed by the
 * runner from whatever the simulated model returns.
 */
import type { OutputField, ResolvedInput, StepType } from '../domain/types'
import { NARRATIVES, NEWS_CLASSIFICATIONS } from '../seed/content'
import { exampleFromSchema } from './schema'
import { hash } from './util'

export const SCENARIOS: { id: string; label: string; description: string }[] = [
  { id: 'well_supported', label: 'Well supported', description: 'Relevant excerpts; the generator writes a supported summary and the validator passes with high confidence.' },
  { id: 'worked_example', label: 'Low confidence → second review → retry', description: 'First draft overstates a finding. The validator passes at 0.74, the second reviewer flags wording, and a retry fixes it.' },
  { id: 'insufficient', label: 'Insufficient relevant evidence', description: 'Excerpts exist but say nothing about the theme. The selector returns insufficient_evidence.' },
  { id: 'unsupported_claim', label: 'Unsupported claim', description: 'The generator adds an accreditation claim that no excerpt supports. Avoided if the prompt tells the model not to mention awards or accreditations without evidence.' },
  { id: 'too_long', label: 'Over word limit', description: 'First draft exceeds the word limit, so the deterministic check fails and generation retries.' },
  { id: 'invalid_json', label: 'Malformed output', description: 'First generation returns text that is not valid JSON.' },
  { id: 'provider_error', label: 'Provider timeout', description: 'The validator call times out on its first invocation.' },
]

export const UNSUPPORTED_CLAIM =
  ' The school holds the Quality in Careers Standard, and every pupil completes two weeks of work experience.'
const AVOID_UNSUPPORTED = /accreditation|award|quality mark|quality in careers/i
const OVERSTATED = 'outstanding'

export interface SimArgs {
  stepCode: string
  stepType: StepType
  modelId: string
  scenario: string
  invocation: number
  orgId: string | null
  resolved: ResolvedInput[]
  promptText: string
  outputSchema: OutputField[]
  uncertaintyOutcome: string
}

export interface SimResponse {
  raw: string
  latencyMs: number
  error?: { outcome: 'provider_error' | 'timeout'; message: string }
}

function latency(args: SimArgs): number {
  return 700 + (hash(`${args.stepCode}:${args.invocation}:${args.orgId}`) % 1100)
}

function allRefs(resolved: ResolvedInput[]): string[] {
  return resolved.flatMap((r) => r.sourceRowIds)
}

function candidateText(resolved: ResolvedInput[]): string {
  return resolved
    .filter((r) => r.role === 'candidate')
    .map((r) => r.value)
    .join('\n')
}

function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

function selectEvidence(args: SimArgs) {
  const refs = allRefs(args.resolved)
  const n = args.orgId ? NARRATIVES[args.orgId] : undefined
  if (args.scenario === 'insufficient' || !n) {
    if (!n && args.scenario !== 'insufficient' && refs.length) {
      return { relevant_refs: refs.slice(0, 3), relevance_note: 'Selected the excerpts that refer to the theme.', outcome: 'relevant_found' }
    }
    return {
      relevant_refs: [],
      relevance_note: '',
      outcome: args.uncertaintyOutcome || 'insufficient_evidence',
      reason: 'The excerpts cover behaviour, pastoral support and reading. None describe careers education, guidance or employer encounters.',
    }
  }
  const selected = n.selectRefs.filter((r) => refs.includes(r))
  return {
    relevant_refs: selected,
    relevance_note: `${selected.length} of ${refs.length} captured excerpts describe careers education, guidance or employer encounters.`,
    outcome: 'relevant_found',
  }
}

function generateSummary(args: SimArgs): string | object {
  const n = args.orgId ? NARRATIVES[args.orgId] : undefined
  const refs = allRefs(args.resolved)
  if (args.scenario === 'insufficient' || (!n && refs.length === 0)) {
    return { summary: '', sentiment: 'mixed', evidence_refs: [], outcome: args.uncertaintyOutcome || 'insufficient_evidence', reason: 'No supplied excerpt describes careers provision.' }
  }
  const base = n ?? {
    summary: 'The supplied evidence describes a careers programme with employer encounters and impartial guidance. Inspectors identified areas to strengthen.',
    summaryRefs: refs.slice(0, 2),
    sentiment: 'mixed',
    longExtra: undefined,
  }
  let summary = base.summary
  const first = args.invocation === 1
  if (args.scenario === 'invalid_json' && first) {
    return `Here is the summary you asked for:\n{ summary: "${base.summary.slice(0, 120)}…", sentiment: ${base.sentiment}, evidence_refs: [${base.summaryRefs.join(', ')}] `
  }
  if (args.scenario === 'too_long' && first) summary = base.summary + (base.longExtra ?? ' ' + base.summary)
  if (args.scenario === 'worked_example' && first) {
    const replaced = summary.replace(/has a well-sequenced/i, `has an ${OVERSTATED}, well-sequenced`)
    summary = replaced !== summary ? replaced : `Overall, careers provision is ${OVERSTATED}. ${summary}`
  }
  if (args.scenario === 'unsupported_claim' && !AVOID_UNSUPPORTED.test(args.promptText)) summary = summary + UNSUPPORTED_CLAIM
  return { summary, sentiment: base.sentiment, evidence_refs: base.summaryRefs.filter((r) => refs.length === 0 || refs.includes(r)), outcome: 'summary_written' }
}

function validate(args: SimArgs, second: boolean) {
  const text = candidateText(args.resolved)
  const refs = allRefs(args.resolved)
  const baseConf = 0.86 + (hash(text) % 9) / 100
  if (text.includes(UNSUPPORTED_CLAIM.trim().slice(0, 40))) {
    return {
      verdict: 'material_error',
      confidence: 0.88,
      findings: [
        {
          criterion: 'Claims supported by evidence',
          severity: 'material',
          claim: 'The school holds the Quality in Careers Standard, and every pupil completes two weeks of work experience.',
          source_ref: refs[0] ?? null,
          explanation: 'No supplied excerpt mentions the Quality in Careers Standard or two weeks of work experience. The excerpts describe a programme that is not well coordinated.',
        },
      ],
    }
  }
  if (text.toLowerCase().includes(OVERSTATED)) {
    if (second) {
      return {
        verdict: 'correctable_issue',
        confidence: 0.83,
        findings: [
          {
            criterion: 'Material findings represented accurately',
            severity: 'correctable',
            claim: `“${OVERSTATED}, well-sequenced careers programme”`,
            source_ref: refs[0] ?? null,
            explanation: 'Inspectors describe the programme as well sequenced; “outstanding” overstates the evidence and reads as an inspection grade. Remove the word and keep the finding.',
          },
        ],
      }
    }
    return {
      verdict: 'pass',
      confidence: 0.74,
      findings: [
        {
          criterion: 'Material findings represented accurately',
          severity: 'minor',
          claim: `“${OVERSTATED}”`,
          source_ref: refs[0] ?? null,
          explanation: 'Claims are supported, but one adjective may overstate the evidence.',
        },
      ],
    }
  }
  return { verdict: 'pass', confidence: Math.round(baseConf * 100) / 100, findings: [] }
}

function classifyArticle(args: SimArgs) {
  const c = args.orgId ? NEWS_CLASSIFICATIONS[args.orgId] : undefined
  const refs = allRefs(args.resolved)
  if (!c) return { theme: 'curriculum', sentiment: 'mixed', relevance: 0.4, rationale: 'General school news.', article_ref: refs[0] ?? null }
  return { ...c, article_ref: refs[0] ?? null }
}

export function simulateModelCall(args: SimArgs): SimResponse {
  const latencyMs = latency(args)
  if (args.scenario === 'provider_error' && args.stepCode === 'validate_claims' && args.invocation === 1) {
    return { raw: '', latencyMs: 30000, error: { outcome: 'timeout', message: `Simulated: ${args.modelId} did not respond within the configured 30s timeout` } }
  }
  let body: string | object
  switch (args.stepCode) {
    case 'select_evidence':
      body = selectEvidence(args)
      break
    case 'generate_summary':
      body = generateSummary(args)
      break
    case 'validate_claims':
      body = validate(args, false)
      break
    case 'second_review':
      body = validate(args, true)
      break
    case 'classify_article':
      body = classifyArticle(args)
      break
    default:
      body = genericResponse(args)
  }
  return { raw: typeof body === 'string' ? body : json(body), latencyMs }
}

/** Fallback for steps without a script: build a plausible response from the schema. */
function genericResponse(args: SimArgs): object {
  if (args.stepType === 'validate') {
    const v = validate(args, false)
    const out = exampleFromSchema(args.outputSchema)
    for (const k of Object.keys(out)) if (k in v) out[k] = (v as Record<string, unknown>)[k]
    return out
  }
  const out = exampleFromSchema(args.outputSchema)
  const material = args.resolved.find((r) => r.role === 'material')
  const refs = allRefs(args.resolved)
  for (const f of args.outputSchema) {
    if (f.type === 'string' && material && f.example === undefined) {
      const sentences = material.value.replace(/\[[^\]]+\][^\n]*\n/g, '').split(/(?<=\.)\s+/).slice(0, 2).join(' ')
      out[f.name] = sentences || `Simulated ${f.name}`
    }
    if (f.type === 'string_list' && /ref/i.test(f.name)) out[f.name] = refs.slice(0, 2)
    if (f.type === 'number' && (f.max ?? 2) <= 1) out[f.name] = 0.82
    if (f.type === 'enum' && f.name === 'outcome' && f.allowedValues?.length) {
      out[f.name] = f.allowedValues.find((v) => v !== args.uncertaintyOutcome) ?? f.allowedValues[0]
    }
  }
  return out
}
