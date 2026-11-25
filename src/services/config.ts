import type { DbAccess } from '../data/db'
import { addAudit, randomCode } from '../data/db'
import type { ID, Pipeline, PipelineVersion, Step } from '../domain/types'
import { validateVersion } from '../engine/graph'
import { clone } from '../engine/util'
import { blankAnswers } from '../seed/pipelines'

export class ConfigError extends Error {}

export function newPipelineKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24)
  return `pk_${slug || 'pipeline'}_${randomCode(8)}`
}

export function blankStep(type: Step['type'], order: number, code: string, name: string): Step {
  return {
    id: `st-${randomCode(6).toLowerCase()}`,
    code,
    name,
    type,
    displayOrder: order,
    modelConfigId: type === 'check' ? null : type === 'validate' ? 'm-sonnet' : 'm-gpt41',
    settings: { temperature: type === 'generate' ? 0.2 : 0, maxOutputTokens: type === 'check' ? 0 : 800 },
    bindings: [],
    prompt: blankAnswers(),
    outputSchema:
      type === 'validate'
        ? [
            { id: `f-${randomCode(5)}`, name: 'verdict', type: 'enum', required: true, allowedValues: ['pass', 'fail'], description: 'Overall verdict' },
            { id: `f-${randomCode(5)}`, name: 'confidence', type: 'number', required: false, min: 0, max: 1, description: 'Certainty in the verdict' },
            { id: `f-${randomCode(5)}`, name: 'reasons', type: 'string_list', required: true, description: 'Reasons for the verdict' },
          ]
        : [],
    checks: type === 'check' ? [] : [],
    rules: [],
    defaultRoute: { type: 'complete' },
    maxInvocations: null,
  }
}

export function createPipeline(
  access: DbAccess,
  args: { name: string; description: string; taskKind: Pipeline['taskKind']; actorId: ID; at: string },
): { pipelineId: ID; versionId: ID } {
  const pipelineId = `pl-${randomCode(6).toLowerCase()}`
  const versionId = `v-${randomCode(6).toLowerCase()}`
  const step = blankStep('generate', 1, 'generate', 'Generate')
  step.prompt.verdicts = []
  access.mutate((d) => {
    d.pipelines.push({
      id: pipelineId,
      key: newPipelineKey(args.name),
      name: args.name,
      description: args.description,
      ownerId: args.actorId,
      activeVersionId: null,
      createdAt: args.at,
      taskKind: args.taskKind,
    })
    d.versions.push({
      id: versionId,
      pipelineId,
      number: 1,
      state: 'draft',
      authorId: args.actorId,
      createdAt: args.at,
      updatedAt: args.at,
      maxRequestAttempts: 3,
      exhaustionAction: 'manual_review',
      inputs: [],
      steps: [step],
      entryStepId: step.id,
      resultStepId: step.id,
      destination: {
        destination: 'athena',
        adapter: 'AthenaInsightAdapter (simulated)',
        description: 'Writes one Insight per completed request.',
        fields: [{ id: `dm-${randomCode(5)}`, target: 'Insight.OrgId', source: { kind: 'request', field: 'orgId' } }],
        evidenceField: null,
      },
    })
    addAudit(d, { at: args.at, actorId: args.actorId, kind: 'pipeline_created', message: `Created pipeline “${args.name}” with draft V1`, pipelineId, versionId })
  })
  return { pipelineId, versionId }
}

export function draftFor(access: DbAccess, pipelineId: ID): PipelineVersion | undefined {
  return access.get().versions.find((v) => v.pipelineId === pipelineId && v.state === 'draft')
}

export function createDraftFrom(access: DbAccess, versionId: ID, actorId: ID, at: string): ID {
  const db = access.get()
  const source = db.versions.find((v) => v.id === versionId)
  if (!source) throw new ConfigError('Version not found.')
  const existing = draftFor(access, source.pipelineId)
  if (existing) throw new ConfigError(`V${existing.number} is already a draft for this pipeline. Publish or discard it first.`)
  const number = Math.max(...db.versions.filter((v) => v.pipelineId === source.pipelineId).map((v) => v.number)) + 1
  const id = `v-${randomCode(6).toLowerCase()}`
  access.mutate((d) => {
    const copy = clone(source)
    copy.id = id
    copy.number = number
    copy.state = 'draft'
    copy.authorId = actorId
    copy.createdAt = at
    copy.updatedAt = at
    copy.copiedFromVersionId = source.id
    copy.changeNote = ''
    delete copy.publishedAt
    delete copy.publishedById
    delete copy.approvedBy
    d.versions.push(copy)
    addAudit(d, { at, actorId, kind: 'draft_created', message: `Created draft V${number} from V${source.number}`, pipelineId: source.pipelineId, versionId: id })
  })
  return id
}

/** Edit a draft. Published configuration is frozen. */
export function updateDraft(access: DbAccess, versionId: ID, fn: (v: PipelineVersion) => void) {
  access.mutate((d) => {
    const v = d.versions.find((x) => x.id === versionId)
    if (!v || v.state !== 'draft') return
    fn(v)
    v.updatedAt = new Date().toISOString()
  })
}

export function discardDraft(access: DbAccess, versionId: ID) {
  access.mutate((d) => {
    const v = d.versions.find((x) => x.id === versionId)
    if (!v || v.state !== 'draft') return
    const p = d.pipelines.find((x) => x.id === v.pipelineId)
    if (p && !p.activeVersionId && d.versions.filter((x) => x.pipelineId === p.id).length === 1) return
    d.versions = d.versions.filter((x) => x.id !== versionId)
  })
}

export function publishVersion(access: DbAccess, versionId: ID, args: { approvedBy: string; changeNote: string; actorId: ID; at: string }) {
  const v = access.get().versions.find((x) => x.id === versionId)
  if (!v || v.state !== 'draft') throw new ConfigError('Only a draft can be published.')
  if (!args.approvedBy.trim()) throw new ConfigError('Enter the name of the approver.')
  const errors = validateVersion(v).filter((i) => i.severity === 'error')
  if (errors.length) throw new ConfigError(`Resolve ${errors.length} issue(s) before publishing.`)
  access.mutate((d) => {
    const ver = d.versions.find((x) => x.id === versionId) as PipelineVersion
    ver.state = 'published'
    ver.publishedAt = args.at
    ver.publishedById = args.actorId
    ver.approvedBy = args.approvedBy.trim()
    ver.changeNote = args.changeNote.trim() || ver.changeNote
    const p = d.pipelines.find((x) => x.id === ver.pipelineId)
    const prev = d.versions.find((x) => x.id === p?.activeVersionId)
    if (p) p.activeVersionId = ver.id
    addAudit(d, {
      at: args.at,
      actorId: args.actorId,
      kind: 'version_published',
      message: `Published V${ver.number}${prev ? ` (replacing V${prev.number} for new requests)` : ''}; approved by ${ver.approvedBy}`,
      pipelineId: ver.pipelineId,
      versionId: ver.id,
    })
  })
}
