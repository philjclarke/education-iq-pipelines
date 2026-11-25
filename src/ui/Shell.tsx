import { Cpu, Database, History, Inbox, LayoutDashboard, Loader2, Play, RotateCcw, Send, Settings, UserCheck, Workflow } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { access, resetDb, useDb } from '../data/store'
import { eligibleRequests } from '../services/requests'
import { runWorker, useWorker } from '../services/worker'
import { Button, cx, Modal, Toggle, toast, useNow } from './kit'
import { SubmitRequestModal } from './SubmitRequestModal'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pipelines', label: 'Pipelines', icon: Workflow },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/reviews', label: 'Manual review', icon: UserCheck, badge: 'reviews' as const },
  { to: '/sources', label: 'Source inputs', icon: Database },
  { to: '/models', label: 'Models & rates', icon: Cpu },
  { to: '/activity', label: 'Audit log', icon: History },
]

export function Shell({ children }: { children: ReactNode }) {
  const openReviews = useDb((db) => db.reviews.filter((r) => r.status === 'open').length)
  const users = useDb((db) => db.users.filter((u) => u.id !== 'system'))
  const currentUserId = useDb((db) => db.currentUserId)
  const outage = useDb((db) => db.settings.athenaOutage)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-screen min-w-[1100px] overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src="/favicon.svg" alt="" className="size-8" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-neutral-900">Education IQ</div>
            <div className="text-xs text-neutral-500">AI Pipelines</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )
              }
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              {n.badge === 'reviews' && openReviews > 0 && <span className="rounded-full bg-warning-100 px-1.5 text-xs font-semibold text-warning-800">{openReviews}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-neutral-200 p-3">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Acting as</div>
            <select
              value={currentUserId}
              onChange={(e) => access.mutate((d) => void (d.currentUserId = e.target.value))}
              className="h-8 w-full rounded-[6px] border border-neutral-300 bg-white px-2 text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
            <Settings className="size-4" /> Prototype settings
            {outage && <span className="ml-auto size-2 rounded-full bg-error-500" title="Athena outage simulated" />}
          </button>
          <p className="px-1 text-[11px] leading-snug text-neutral-400">Prototype with sample data. All model calls, costs and Athena deliveries are simulated.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="pegboard scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function TopBar() {
  const now = useNow(5000)
  const { running, current } = useWorker()
  const queue = useDb((db) => {
    const waiting = db.requests.filter((r) => r.status === 'queued').length
    const retry = db.requests.filter((r) => r.status === 'retry_scheduled').length
    const inProgress = db.requests.filter((r) => r.status === 'in_progress').length
    return { waiting, retry, inProgress }
  })
  const eligible = useDb((db) => eligibleRequests(db, now).length)
  const [submitOpen, setSubmitOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6">
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">Queue</span>
        <span>{queue.waiting} waiting</span>
        <span className="text-neutral-300">·</span>
        <span>{queue.retry} retry scheduled</span>
        <span className="text-neutral-300">·</span>
        <span className={cx(queue.inProgress > 0 && 'font-medium text-primary-700')}>{queue.inProgress} in progress</span>
        {running && current && (
          <button type="button" onClick={() => navigate(`/requests/${current}`)} className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 font-medium text-primary-700 hover:bg-primary-100">
            <span className="live-dot size-1.5 rounded-full bg-primary-500" />
            Worker processing {current}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button icon={<Send className="size-4" />} onClick={() => setSubmitOpen(true)}>
          Submit request
        </Button>
        <Button
          variant="solid"
          tone="primary"
          disabled={running || eligible === 0}
          icon={running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          onClick={async () => {
            const n = await runWorker()
            toast(`Worker processed ${n} request${n === 1 ? '' : 's'}`, 'info')
          }}
          title={eligible === 0 ? 'Nothing eligible in the queue' : undefined}
        >
          {running ? 'Worker running…' : `Run worker${eligible ? ` (${eligible})` : ''}`}
        </Button>
      </div>
      <SubmitRequestModal open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </header>
  )
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const outage = useDb((db) => db.settings.athenaOutage)
  const [confirm, setConfirm] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Prototype settings">
      <div className="space-y-5">
        <div>
          <Toggle checked={outage} onChange={(v) => access.mutate((d) => void (d.settings.athenaOutage = v))} label={<span className="font-medium">Simulate an Athena outage</span>} />
          <p className="mt-1 text-xs text-neutral-500">New deliveries fail with a 503 until this is switched off. Use it to show that delivery is retried separately from AI processing.</p>
        </div>
        <div className="rounded-[8px] border border-neutral-200 p-3">
          <div className="font-medium text-neutral-800">Reset demo data</div>
          <p className="mt-1 text-xs text-neutral-500">Discards your edits, test runs and requests, and regenerates the seeded history.</p>
          {confirm ? (
            <div className="mt-2 flex gap-2">
              <Button
                tone="error"
                variant="solid"
                size="sm"
                onClick={async () => {
                  await resetDb()
                  setConfirm(false)
                  onClose()
                  toast('Demo data reset')
                }}
              >
                Yes, reset everything
              </Button>
              <Button size="sm" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button className="mt-2" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm(true)}>
              Reset…
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
