import { ExternalLink } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useDb } from '../data/store'
import { recordIssue } from '../engine/inputs'
import { Badge, Card, cx, Mono, PageHeader, Select } from '../ui/kit'

export default function Sources() {
  const [params, setParams] = useSearchParams()
  const orgs = useDb((db) => db.orgs)
  const types = useDb((db) => db.inputTypes)
  const records = useDb((db) => db.inputRecords)
  const orgId = params.get('org') ?? ''
  const type = params.get('type') ?? ''
  const rows = records.filter((r) => (!orgId || r.orgId === orgId) && (!type || r.typeRef === type))
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }
  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Source inputs" subtitle="Sample rows from the existing EdIQ Inputs table: content snippets from Athena and facts from Atlas. Dynamic pipeline inputs look these up by organisation and type reference." />
      <div className="mb-4 grid grid-cols-5 gap-3">
        {types.map((t) => (
          <button key={t.code} type="button" onClick={() => set('type', type === t.code ? '' : t.code)} className={cx('surface p-3 text-left', type === t.code && 'ring-2 ring-primary-300')}>
            <div className="flex items-center justify-between">
              <Mono className="font-medium text-neutral-900">{t.code}</Mono>
              <Badge color={t.source === 'Atlas' ? 'secondary' : t.source === 'Athena' ? 'primary' : 'neutral'}>{t.source}</Badge>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{t.description}</div>
            <div className="mt-1 text-xs font-medium text-neutral-700">{records.filter((r) => r.typeRef === t.code).length} rows</div>
          </button>
        ))}
      </div>
      <Card
        title={`${rows.length} rows`}
        padded={false}
        actions={
          <Select className="w-64" value={orgId} onChange={(e) => set('org', e.target.value)}>
            <option value="">All organisations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.urn})
              </option>
            ))}
          </Select>
        }
      >
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Source row</th>
              <th className="px-4 py-2 font-medium">Organisation</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Content</th>
              <th className="px-4 py-2 font-medium">Published</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 align-top">
            {rows.map((r) => {
              const issue = recordIssue(r)
              return (
                <tr key={r.id} className={cx(issue && 'bg-error-50/40')}>
                  <td className="px-4 py-2.5">
                    <Mono className="text-primary-700">{r.id}</Mono>
                    {r.sourceUrl && (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-block text-neutral-400 hover:text-neutral-700">
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700">{orgs.find((o) => o.id === r.orgId)?.name}</td>
                  <td className="px-4 py-2.5">
                    <Mono>{r.typeRef}</Mono>
                  </td>
                  <td className="max-w-xl px-4 py-2.5">
                    <div className="font-medium text-neutral-800">{r.title}</div>
                    {issue ? <div className="text-xs text-error-700">Unusable: {issue}</div> : <div className="text-xs text-neutral-600">{r.content}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{r.publishedAt}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-neutral-500">All organisations and content are fictional sample data. Organisations with no rows of a required type demonstrate the Missing input path.</p>
    </div>
  )
}
