import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/useAuth'
import { Toaster } from '@/components/ui/Toast'
import { Landing } from '@/pages/Landing'
import { AuthPage } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { NewProject } from '@/pages/NewProject'
import { LogoMark } from '@/components/ui/Logo'

const EditorPage = lazy(() => import('@/pages/Editor').then((m) => ({ default: m.EditorPage })))

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
  // Enter-only animation: exit transitions with <Outlet /> would re-render the
  // incoming route inside the exiting wrapper and mount every page twice.
  return (
    <motion.div key={location.pathname} className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Outlet />
    </motion.div>
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
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/new" element={<NewProject />} />
            <Route path="/import" element={<NewProject importMode />} />
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
