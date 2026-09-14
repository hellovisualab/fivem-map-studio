import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/useAuth'
import { Toaster } from '@/components/ui/Toast'
import { Landing } from '@/pages/Landing'
import { AuthPage } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { NewProject } from '@/pages/NewProject'
import { ToolsHub } from '@/pages/ToolsHub'
import { LogoMark } from '@/components/ui/Logo'

const EditorPage = lazy(() => import('@/pages/Editor').then((m) => ({ default: m.EditorPage })))
const HandlingEditor = lazy(() => import('@/pages/tools/HandlingEditor').then((m) => ({ default: m.HandlingEditor })))
const YtdOptimizer = lazy(() => import('@/pages/tools/YtdOptimizer').then((m) => ({ default: m.YtdOptimizer })))
const PropCreator = lazy(() => import('@/pages/tools/PropCreator').then((m) => ({ default: m.PropCreator })))

function FullscreenLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <LogoMark className="h-12 w-12" />
      </motion.div>
    </div>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullscreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

function PageTransition() {
  const location = useLocation()
  return (
    <motion.div key={location.pathname} className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Outlet />
    </motion.div>
  )
}

function ToolSuspense() {
  return (
    <Suspense fallback={<FullscreenLoader />}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      <Routes>
        <Route element={<PageTransition />}>
          <Route path="/" element={<Landing />} />
          <Route path="/tools" element={<ToolsHub />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/new" element={<NewProject />} />
            <Route path="/import" element={<NewProject importMode />} />
            <Route element={<ToolSuspense />}>
              <Route path="/tools/handling" element={<HandlingEditor />} />
              <Route path="/tools/ytd" element={<YtdOptimizer />} />
              <Route path="/tools/props" element={<PropCreator />} />
            </Route>
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route
            path="/editor/:id"
            element={
              <Suspense fallback={<FullscreenLoader />}>
                <EditorPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
