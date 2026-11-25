/** Browser-side runtime for the simulated worker. */
import { create } from 'zustand'
import { access } from '../data/store'
import { realClock } from '../engine/util'
import { eligibleRequests, processRequest, recoverExpiredLeases } from './requests'

interface WorkerState {
  running: boolean
  current: string | null
  processed: number
}

export const useWorker = create<WorkerState>(() => ({ running: false, current: null, processed: 0 }))

/** Process every eligible request in queue order, one at a time, with live updates. */
export async function runWorker(limit = 50): Promise<number> {
  if (useWorker.getState().running) return 0
  useWorker.setState({ running: true, processed: 0 })
  let count = 0
  try {
    recoverExpiredLeases(access, Date.now(), 'system')
    for (let i = 0; i < limit; i++) {
      const next = eligibleRequests(access.get(), Date.now())[0]
      if (!next) break
      useWorker.setState({ current: next.id })
      await processRequest(access, next.id, { clock: realClock, simulateLatency: true, workerId: 'worker-web-01' })
      count++
      useWorker.setState({ processed: count })
    }
  } finally {
    useWorker.setState({ running: false, current: null })
  }
  return count
}

export async function runOne(requestId: string) {
  if (useWorker.getState().running) return
  useWorker.setState({ running: true, current: requestId })
  try {
    await processRequest(access, requestId, { clock: realClock, simulateLatency: true, workerId: 'worker-web-01' })
  } finally {
    useWorker.setState({ running: false, current: null })
  }
}

/** On load, any request left in progress by a closed page has an expired lease. */
export function expireStaleLeases() {
  access.mutate((d) => {
    for (const r of d.requests) if (r.status === 'in_progress' && r.lease) r.lease.expiresAt = new Date(Date.now() - 1000).toISOString()
  })
}
