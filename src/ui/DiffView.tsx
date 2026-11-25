import { diffLines } from '../engine/diff'
import { cx } from './kit'

/** Shows changed lines with a little surrounding context. */
export function DiffView({ before, after, context = 2, maxH = 'max-h-96' }: { before: string; after: string; context?: number; maxH?: string }) {
  const lines = diffLines(before, after)
  const keep = new Set<number>()
  lines.forEach((l, i) => {
    if (l.type !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep.add(k)
  })
  if (keep.size === 0) return <div className="text-xs text-neutral-500">No differences.</div>
  const out: React.ReactNode[] = []
  let last = -1
  lines.forEach((l, i) => {
    if (!keep.has(i)) return
    if (last >= 0 && i > last + 1) out.push(<div key={`gap-${i}`} className="px-2 text-neutral-400">⋯</div>)
    out.push(
      <div key={i} className={cx('whitespace-pre-wrap px-2', l.type === 'add' && 'bg-success-50 text-success-800', l.type === 'del' && 'bg-error-50 text-error-800 line-through decoration-error-300')}>
        <span className="mr-2 select-none text-neutral-400">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
        {l.text || ' '}
      </div>,
    )
    last = i
  })
  return <div className={cx('scroll-thin overflow-auto rounded-[6px] border border-neutral-200 bg-white py-1 font-mono text-[11.5px] leading-relaxed', maxH)}>{out}</div>
}
