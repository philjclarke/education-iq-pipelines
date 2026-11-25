import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { access, loadDb, useStore } from './data/store'
import Activity from './pages/Activity'
import Dashboard from './pages/Dashboard'
import Models from './pages/Models'
import PipelineDetail from './pages/PipelineDetail'
import Pipelines from './pages/Pipelines'
import RequestDetail from './pages/RequestDetail'
import Requests from './pages/Requests'
import Reviews from './pages/Reviews'
import Sources from './pages/Sources'
import VersionWorkspace from './pages/version/VersionWorkspace'
import { markInterruptedTestRuns } from './services/testing'
import { expireStaleLeases } from './services/worker'
import { Shell } from './ui/Shell'
import { Toaster } from './ui/kit'

export default function App() {
  const status = useStore((s) => s.status)

  useEffect(() => {
    loadDb().then(() => {
      expireStaleLeases()
      markInterruptedTestRuns(access)
    })
  }, [])

  if (status !== 'ready') {
    return (
      <div className="pegboard flex h-screen items-center justify-center">
        <div className="surface flex items-center gap-3 px-5 py-4 text-sm text-neutral-600">
          <Loader2 className="size-4 animate-spin text-primary-600" />
          Preparing sample data…
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipelines" element={<Pipelines />} />
          <Route path="/pipelines/:pipelineId" element={<PipelineDetail />} />
          <Route path="/pipelines/:pipelineId/versions/:versionId/*" element={<VersionWorkspace />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/requests/:requestId" element={<RequestDetail />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/:reviewId" element={<Reviews />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/models" element={<Models />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="*" element={<div className="p-8">Page not found.</div>} />
        </Routes>
      </Shell>
      <Toaster />
    </BrowserRouter>
  )
}
