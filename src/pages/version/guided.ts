import type { Pipeline } from '../../domain/types'

type Kind = Pipeline['taskKind']

export interface GuidedQuestion {
  key: string
  number: number
  title: string
  help: string
  control: string
  required?: boolean
  recommended?: boolean
  examples?: Partial<Record<Kind, string | string[]>>
}

/** Generation step questions (brief §2.2a). */
export const GENERATION_QUESTIONS: GuidedQuestion[] = [
  {
    key: 'produce',
    number: 1,
    title: 'What should the model produce?',
    help: 'Describe the deliverable and the unit of work: one output, for one organisation, from which material.',
    control: 'Required text',
    required: true,
    examples: {
      evidence_summary: 'Write one summary of careers provision for one school, based on the supplied inspection excerpts.',
      classification: 'Classify one news article by the single EdIQ theme it best fits, and rate its sentiment for the organisation.',
      extraction: 'Extract every procurement signal (planned purchase, contract renewal or tender) from the supplied auditor report excerpts for one trust.',
    },
  },
  {
    key: 'audience',
    number: 2,
    title: 'Who will use it, and what for?',
    help: 'Explain what the reader needs from the output. This helps the model choose what matters and how much detail to give.',
    control: 'Recommended text',
    recommended: true,
    examples: {
      evidence_summary: 'An EdIQ user needs to understand the school’s provision quickly and see the evidence behind the summary.',
      classification: 'Athena uses the classification to attach the article to the right theme on the organisation’s profile.',
      extraction: 'Partnerships teams use the signals to spot organisations that may need support in the next 12 months.',
    },
  },
  {
    key: 'background',
    number: 3,
    title: 'What does the model need to understand first?',
    help: 'Add domain definitions, classifications or conventions. Insert fixed inputs already defined in the pipeline rather than pasting their text.',
    control: 'Text with fixed-input picker',
    examples: {
      evidence_summary: 'Careers provision is defined as follows:\n{{theme_definition}}\n\nThe supplied theme decides what is relevant in the excerpts.',
      classification: 'Themes:\n{{theme_list}}',
      extraction: 'A procurement signal is a stated intention to buy, renew or tender for goods or services within the next two financial years.',
    },
  },
  {
    key: 'materials',
    number: 4,
    title: 'What material should the model use?',
    help: 'Select the actual inputs and explain what each represents. A sample resolved value is shown beside each binding.',
    control: 'Required binding picker with a usage note per input',
    required: true,
  },
  {
    key: 'inclusion',
    number: 5,
    title: 'How should it decide what to include?',
    help: 'Capture the judgement you would teach a new analyst.',
    control: 'Repeatable list of instructions',
    examples: {
      evidence_summary: ['Prioritise specific findings about careers provision.', 'Where the evidence supports it, cover both strengths and areas for improvement.', 'Distinguish an observation from an inference.'],
      classification: ['Choose the theme the article is mainly about, not one it mentions in passing.'],
      extraction: ['Only include signals with a stated or implied timescale.', 'Ignore routine maintenance spending.'],
    },
  },
  {
    key: 'evidenceRules',
    number: 6,
    title: 'What claims can it make, and how should it support them?',
    help: 'Define the evidence standard. Say what must be cited, and how to handle disagreement between sources.',
    control: 'Evidence rules with editable examples',
    examples: {
      evidence_summary: [
        'Each substantive claim must be supported by a supplied excerpt. Return its source ID.',
        'Where excerpts disagree, describe the difference if it affects the conclusion.',
        'Do not mention awards, accreditations or quality marks unless an excerpt states them.',
      ],
      classification: ['Return the source ID of the article you classified.'],
      extraction: ['Quote the sentence that contains each signal and return its source ID.'],
    },
  },
  {
    key: 'uncertainty',
    number: 7,
    title: 'What should it do when the evidence is weak, conflicting or irrelevant?',
    help: 'Give the model an explicit way to report uncertainty. A missing required input is handled before the model runs; this question covers inputs that exist but do not support the task.',
    control: 'Outcome picker plus instructions',
    examples: {
      evidence_summary: 'If the excerpts say nothing about careers provision, return insufficient_evidence and a short reason.',
      classification: 'If the article is not about the organisation, return insufficient_evidence.',
      extraction: 'If no excerpt contains a procurement signal, return insufficient_evidence rather than an empty list.',
    },
  },
  {
    key: 'writing',
    number: 8,
    title: 'How should the result read?',
    help: 'Specify tone, length and presentation. If you set a hard word limit, add a matching deterministic check so it is enforced, not just requested.',
    control: 'Writing guidance plus optional linked checks',
    examples: {
      evidence_summary: 'Use neutral UK English. Write a short paragraph of up to 100 words. Avoid generic praise and recommendations.',
      classification: 'Give a one-sentence rationale in neutral UK English.',
      extraction: 'Describe each signal in one plain sentence.',
    },
  },
  {
    key: 'output',
    number: 9,
    title: 'What fields must the result contain?',
    help: 'Define the output in terms the next step can use. Fields marked “routable” can be used in routing rules. This editor is the single source for the preview, validator bindings and routing pickers.',
    control: 'Structured output editor with JSON preview',
    required: true,
  },
  {
    key: 'examples',
    number: 10,
    title: 'Can you show an example of a good answer or a common mistake?',
    help: 'Add sample inputs, a preferred response and a short explanation. Include an edge case as well as a successful example.',
    control: 'Optional repeatable examples',
  },
]

/** Validation step questions (brief §2.2a). */
export const VALIDATION_QUESTIONS: GuidedQuestion[] = [
  { key: 'candidate', number: 1, title: 'Which result are we checking?', help: 'Bind the exact output from an earlier step, such as Generate summary → summary.', control: 'Binding picker', required: true },
  { key: 'evidence', number: 2, title: 'What should the checker compare it against?', help: 'Bind the relevant source evidence and definitions. For an Ofsted summary, pass the original excerpts so the checker can assess each claim.', control: 'Binding picker', required: true },
  {
    key: 'criteria',
    number: 3,
    title: 'What should the checker look for?',
    help: 'Add named criteria, each with its own instructions.',
    control: 'Named criteria',
    required: true,
    examples: {
      evidence_summary: ['Claims supported by evidence', 'Material findings represented accurately', 'Evidence references support the associated claims'],
    },
  },
  {
    key: 'seriousness',
    number: 4,
    title: 'What makes a problem serious enough to fail?',
    help: 'Describe the difference between a correctable issue and a material error.',
    control: 'Text',
    examples: {
      evidence_summary: 'Awkward wording may be correctable, while attributing a finding to the wrong school is a material error.',
    },
  },
  { key: 'verdicts', number: 5, title: 'What verdicts and findings should the checker return?', help: 'Define allowed verdicts and a structured findings list. Confidence is optional; say what its values mean for this task.', control: 'Verdict list, findings schema and confidence guidance', required: true },
  { key: 'routes', number: 6, title: 'What should the pipeline do with each verdict?', help: 'The configured routes are shown beside each verdict. The pipeline applies these routes using the returned fields.', control: 'Routes by verdict' },
]

export const ROLE_EXAMPLES: Record<string, string> = {
  generate: 'You are an education analyst writing for Education IQ. You write accurate, evidence-based summaries.',
  validate: 'You are a careful fact-checker for Education IQ. You check outputs against the source evidence and report problems precisely.',
}

export const CRITERION_INSTRUCTIONS: Record<string, string> = {
  'Claims supported by evidence': 'Every substantive claim must be supported by at least one supplied excerpt.',
  'Material findings represented accurately': 'Findings must not be overstated, understated, or attributed to the wrong school or phase.',
  'Evidence references support the associated claims': 'Each cited source ID must contain the evidence for the claim it supports.',
}
