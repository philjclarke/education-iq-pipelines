import { useDb } from '../data/store'
import { Badge, Card, fmtDate, Mono, PageHeader } from '../ui/kit'

export default function Models() {
  const models = useDb((db) => db.models)
  const rates = useDb((db) => db.rates)
  const versions = useDb((db) => db.versions)
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Models and rates" subtitle="Model configurations hold a credential reference, never the credential. Rates are recorded separately with an effective date, so every cost estimate traces to the price used at the time." />
      <Card title="Model configurations" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Settings</th>
              <th className="px-4 py-2 font-medium">Timeout</th>
              <th className="px-4 py-2 font-medium">Input budget</th>
              <th className="px-4 py-2 font-medium">Credential reference</th>
              <th className="px-4 py-2 font-medium">Used by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {models.map((m) => {
              const used = versions.filter((v) => v.steps.some((s) => s.modelConfigId === m.id))
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{m.displayName}</div>
                    <Mono className="text-neutral-500">{m.modelId}</Mono>
                  </td>
                  <td className="px-4 py-2.5">{m.provider}</td>
                  <td className="px-4 py-2.5 text-xs text-neutral-600">
                    {[m.supportsTemperature && 'temperature', m.supportsReasoningEffort && 'reasoning effort', `≤ ${m.maxOutputTokens} output tokens`].filter(Boolean).join(' · ')}
                  </td>
                  <td className="px-4 py-2.5">{m.timeoutSec}s</td>
                  <td className="px-4 py-2.5 tabular-nums">{m.inputTokenBudget.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <Mono className="text-neutral-600">{m.credentialRef}</Mono>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">{used.length ? `${used.length} version(s)` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <Card title="Rates" subtitle="Illustrative prices only; real pricing is parked for this prototype." className="mt-4" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Rate ID</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 text-right font-medium">Input / 1M tokens</th>
              <th className="px-4 py-2 text-right font-medium">Output / 1M tokens</th>
              <th className="px-4 py-2 font-medium">Effective from</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rates.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5">
                  <Mono>{r.id}</Mono>
                </td>
                <td className="px-4 py-2.5">{models.find((m) => m.id === r.modelConfigId)?.displayName}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">£{r.inputPerMTokGBP.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">£{r.outputPerMTokGBP.toFixed(2)}</td>
                <td className="px-4 py-2.5">{fmtDate(r.effectiveFrom, false)}</td>
                <td className="px-4 py-2.5">
                  <Badge>{r.note}</Badge>
                </td>
              </tr>
            ))}
            {models
              .filter((m) => !rates.some((r) => r.modelConfigId === m.id))
              .map((m) => (
                <tr key={m.id} className="bg-warning-50/50">
                  <td className="px-4 py-2.5 text-xs text-warning-800" colSpan={6}>
                    No rate recorded for {m.displayName}. Calls to it are flagged as “pricing unavailable” on the dashboard and in traces.
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
