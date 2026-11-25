import { createContext, useContext } from 'react'
import { access } from '../../data/store'
import type { Pipeline, PipelineVersion } from '../../domain/types'
import type { ConfigIssue } from '../../engine/graph'
import { updateDraft } from '../../services/config'

export interface VersionCtx {
  pipeline: Pipeline
  version: PipelineVersion
  readOnly: boolean
  issues: ConfigIssue[]
  edit: (fn: (v: PipelineVersion) => void) => void
  base: string
}

export const VersionContext = createContext<VersionCtx | null>(null)

export function useVersion(): VersionCtx {
  const ctx = useContext(VersionContext)
  if (!ctx) throw new Error('useVersion outside VersionContext')
  return ctx
}

export function makeEdit(versionId: string) {
  return (fn: (v: PipelineVersion) => void) => updateDraft(access, versionId, fn)
}
