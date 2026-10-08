import { Suspense, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Landing from './pages/Landing/Landing'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import { ScreenFallback } from './components/RouteStates/RouteStates'
import { lazyPage } from './lib/lazyPage'
import { useKonami } from './lib/useKonami'
import { sparkRain } from './lib/sparks'
import { toast } from './components/ui'

// Landing is the first paint for visitors and stays in the entry chunk;
// every other page loads on demand.
const Auth = lazyPage(() => import('./pages/Auth/Auth'))
const StyleGuide = lazyPage(() => import('./pages/StyleGuide/StyleGuide'))
const NotFound = lazyPage(() => import('./pages/NotFound/NotFound'))
const Dashboard = lazyPage(() => import('./pages/Dashboard/Dashboard'))
const Repositories = lazyPage(() => import('./pages/Repositories/Repositories'))
const PullRequests = lazyPage(() => import('./pages/PullRequests/PullRequests'))
const Issues = lazyPage(() => import('./pages/Issues/Issues'))
const Gists = lazyPage(() => import('./pages/Gists/Gists'))
const Starred = lazyPage(() => import('./pages/Starred/Starred'))
const Explore = lazyPage(() => import('./pages/Explore/Explore'))
const RepoView = lazyPage(() => import('./pages/RepoView/RepoView'))
const IssueDetail = lazyPage(() => import('./pages/Issues/IssueDetail'))
const PRDetail = lazyPage(() => import('./pages/PullRequests/PRDetail'))
const CommitDetail = lazyPage(() => import('./pages/Commits/CommitDetail'))
const GistDetail = lazyPage(() => import('./pages/Gists/GistDetail'))
const Profile = lazyPage(() => import('./pages/Profile/Profile'))
const AdminDashboard = lazyPage(() => import('./pages/Admin/AdminDashboard'))

function App() {
  // Easter egg: up up down down left right left right B A
  useKonami(useCallback(() => {
    sparkRain(4000)
    toast('You found the forge’s secret', { description: 'Keep the fire burning.' })
  }, []))

  return (
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/styleguide" element={<StyleGuide />} />

        {/* Protected routes render inside the shell, which has its own Suspense boundary */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/pull-requests" element={<PullRequests />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/gists" element={<Gists />} />
            <Route path="/starred" element={<Starred />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/repo/:id" element={<RepoView />} />
            <Route path="/repo/:repoId/issues/:issueId" element={<IssueDetail />} />
            <Route path="/repo/:repoId/pull-requests/:prId" element={<PRDetail />} />
            <Route path="/repo/:repoId/commits/:commitId" element={<CommitDetail />} />
            <Route path="/gists/:id" element={<GistDetail />} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default App
