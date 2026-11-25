export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Small, stable string hash (FNV-1a) used for deterministic simulation. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function seededRandom(seed: number): () => number {
  let s = seed || 1
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** A virtual clock for seeding history instantly with realistic timings. */
export function virtualClock(startMs: number): Clock & { set(ms: number): void } {
  let t = startMs
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms
    },
    set: (ms) => {
      t = ms
    },
  }
}
