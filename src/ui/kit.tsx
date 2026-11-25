import { Check, ChevronDown, ChevronRight, Copy, X } from 'lucide-react'
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { create } from 'zustand'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ───────────── Buttons ─────────────

type Tone = 'primary' | 'neutral' | 'error' | 'success' | 'warning'
type Variant = 'solid' | 'soft' | 'outline' | 'ghost'

const BTN: Record<Variant, Record<Tone, string>> = {
  solid: {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 border-primary-600',
    neutral: 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900',
    error: 'bg-error-600 text-white hover:bg-error-700 border-error-600',
    success: 'bg-success-600 text-white hover:bg-success-700 border-success-600',
    warning: 'bg-warning-500 text-white hover:bg-warning-600 border-warning-500',
  },
  soft: {
    primary: 'bg-primary-50 text-primary-700 hover:bg-primary-100 border-transparent',
    neutral: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border-transparent',
    error: 'bg-error-50 text-error-700 hover:bg-error-100 border-transparent',
    success: 'bg-success-50 text-success-700 hover:bg-success-100 border-transparent',
    warning: 'bg-warning-50 text-warning-800 hover:bg-warning-100 border-transparent',
  },
  outline: {
    primary: 'bg-white text-primary-700 border-primary-300 hover:bg-primary-50',
    neutral: 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50',
    error: 'bg-white text-error-700 border-error-200 hover:bg-error-50',
    success: 'bg-white text-success-700 border-success-200 hover:bg-success-50',
    warning: 'bg-white text-warning-800 border-warning-200 hover:bg-warning-50',
  },
  ghost: {
    primary: 'text-primary-700 hover:bg-primary-50 border-transparent',
    neutral: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 border-transparent',
    error: 'text-error-700 hover:bg-error-50 border-transparent',
    success: 'text-success-700 hover:bg-success-50 border-transparent',
    warning: 'text-warning-800 hover:bg-warning-50 border-transparent',
  },
}

export function Button({
  variant = 'outline',
  tone = 'neutral',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; tone?: Tone; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        BTN[variant][tone],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

// ───────────── Badges ─────────────

export type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
const BADGE: Record<BadgeColor, string> = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-200',
  secondary: 'bg-secondary-50 text-secondary-700 ring-secondary-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  info: 'bg-info-50 text-info-700 ring-info-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  error: 'bg-error-50 text-error-700 ring-error-200',
  neutral: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
}

export function Badge({ color = 'neutral', children, className, dot }: { color?: BadgeColor; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[color], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// ───────────── Layout ─────────────

export function Card({ children, className, title, actions, subtitle, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx('surface', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-neutral-500">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Label({ children, hint, required }: { children: ReactNode; hint?: ReactNode; required?: boolean }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium text-neutral-700">
        {children}
        {required && <span className="ml-0.5 text-error-600">*</span>}
      </span>
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </div>
  )
}

const CONTROL = 'rounded-[6px] border border-neutral-300 bg-white px-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50 disabled:text-neutral-500'

/** Full width unless the caller sets its own width or flex sizing. */
function width(className?: string) {
  return /(^|\s)(w-|flex-1|min-w-)/.test(className ?? '') ? '' : 'w-full'
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, width(props.className), 'h-8', props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(CONTROL, width(props.className), 'py-1.5 leading-relaxed', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, width(props.className), 'h-8 pr-7', props.className)} />
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary-600' : 'bg-neutral-300')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px]', className)}>{children}</span>
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      variant="soft"
      icon={done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {})
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? 'Copied' : label ?? 'Copy'}
    </Button>
  )
}

export function Collapsible({ title, children, defaultOpen = false, right, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 py-1 text-left text-sm font-medium text-neutral-700 hover:text-neutral-900">
        {open ? <ChevronDown className="size-4 text-neutral-400" /> : <ChevronRight className="size-4 text-neutral-400" />}
        <span className="flex-1">{title}</span>
        {right}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  )
}

export function CodeBlock({ children, className, maxH = 'max-h-80' }: { children: ReactNode; className?: string; maxH?: string }) {
  return <pre className={cx('scroll-thin overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-800', maxH, className)}>{children}</pre>
}

export function Json({ value, maxH }: { value: unknown; maxH?: string }) {
  return <CodeBlock maxH={maxH}>{JSON.stringify(value, null, 2)}</CodeBlock>
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-neutral-300 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="text-neutral-400">{icon}</div>}
      <div className="font-medium text-neutral-800">{title}</div>
      {children && <div className="max-w-md text-sm text-neutral-500">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'neutral', onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: BadgeColor; onClick?: () => void }) {
  const bar: Record<BadgeColor, string> = {
    primary: 'bg-primary-500',
    secondary: 'bg-secondary-500',
    success: 'bg-success-500',
    info: 'bg-info-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    neutral: 'bg-neutral-300',
  }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cx('surface relative overflow-hidden p-4 text-left', onClick && 'transition-shadow hover:shadow-md')}>
      <span className={cx('absolute inset-y-0 left-0 w-1', bar[tone])} />
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </Comp>
  )
}

// ───────────── Tabs ─────────────

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number; alert?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-neutral-100 px-1.5 text-xs text-neutral-600">{t.count}</span>}
          {t.alert && <span className="size-1.5 rounded-full bg-error-500" />}
        </button>
      ))}
    </div>
  )
}

// ───────────── Modal ─────────────

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-6 pt-[8vh]" onMouseDown={onClose}>
      <div className={cx('fade-in w-full rounded-[10px] bg-white shadow-xl', width)} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3 rounded-b-[10px]">{footer}</div>}
      </div>
    </div>
  )
}

// ───────────── Toasts ─────────────

interface Toast {
  id: number
  text: ReactNode
  tone: 'success' | 'error' | 'info'
}
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }))
let toastId = 0
export function toast(text: ReactNode, tone: Toast['tone'] = 'success') {
  const id = ++toastId
  useToasts.setState((s) => ({ items: [...s.items, { id, text, tone }] }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4200)
}
export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'fade-in pointer-events-auto max-w-sm rounded-[8px] border px-3.5 py-2.5 text-sm shadow-lg',
            t.tone === 'success' && 'border-success-200 bg-success-50 text-success-800',
            t.tone === 'error' && 'border-error-200 bg-error-50 text-error-800',
            t.tone === 'info' && 'border-info-200 bg-info-50 text-info-800',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

// ───────────── Formatting ─────────────

export function fmtDate(iso?: string, withTime = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtAgo(iso?: string, now = Date.now()): string {
  if (!iso) return '—'
  const s = Math.round((now - Date.parse(iso)) / 1000)
  const abs = Math.abs(s)
  const suffix = s >= 0 ? 'ago' : 'from now'
  if (s > -60 && s < 60) return 'just now'
  if (abs < 3600) return s >= 0 ? `${Math.round(abs / 60)} min ${suffix}` : `in ${Math.round(abs / 60)} min`
  if (abs < 86400) return s >= 0 ? `${Math.round(abs / 3600)} h ${suffix}` : `in ${Math.round(abs / 3600)} h`
  return s >= 0 ? `${Math.round(abs / 86400)} d ${suffix}` : `in ${Math.round(abs / 86400)} d`
}

export function fmtDuration(ms?: number): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`
}

export function fmtGBP(v?: number | null, digits = 4): string {
  if (v === null || v === undefined) return '—'
  return `£${v.toFixed(v > 0 && v < 0.01 ? digits : 2)}`
}

export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
