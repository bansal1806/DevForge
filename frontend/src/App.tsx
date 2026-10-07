import { useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Landing from './pages/Landing/Landing'
import Dashboard from './pages/Dashboard/Dashboard'
import RepoView from './pages/RepoView/RepoView'
import Repositories from './pages/Repositories/Repositories'
import PullRequests from './pages/PullRequests/PullRequests'
import Issues from './pages/Issues/Issues'
import Gists from './pages/Gists/Gists'
import Starred from './pages/Starred/Starred'
import Explore from './pages/Explore/Explore'
import IssueDetail from './pages/Issues/IssueDetail'
import PRDetail from './pages/PullRequests/PRDetail'
import GistDetail from './pages/Gists/GistDetail'
import Profile from './pages/Profile/Profile'
import Auth from './pages/Auth/Auth'
import AdminDashboard from './pages/Admin/AdminDashboard'
import CommitDetail from './pages/Commits/CommitDetail'
import StyleGuide from './pages/StyleGuide/StyleGuide'
import NotFound from './pages/NotFound/NotFound'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import { useKonami } from './lib/useKonami'
import { sparkRain } from './lib/sparks'
import { toast } from './components/ui'

function App() {
  // Easter egg: up up down down left right left right B A
  useKonami(useCallback(() => {
    sparkRain(4000)
    toast('You found the forge’s secret', { description: 'Keep the fire burning.' })
  }, []))

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/styleguide" element={<StyleGuide />} />

      {/* Protected Routes */}
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
  )
}

export default App
