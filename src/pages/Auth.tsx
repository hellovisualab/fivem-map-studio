import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Mail, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { MapBackdrop } from '@/components/landing/MapBackdrop'
import { GlassBlobs } from '@/components/layout/GlassBlobs'
import { useAuth } from '@/store/useAuth'
import { getData } from '@/lib/data'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const local = getData().mode === 'local'

  if (!loading && user) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await signIn(email, password)
      else await signUp(email, password, name)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      <GlassBlobs />
      <MapBackdrop preset="satellite" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="panel relative z-10 w-full max-w-md p-7">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-center text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="text-ink-400 mt-1 text-center text-sm">
          {mode === 'login' ? 'Sign in to continue to your projects.' : 'Start designing your minimap in seconds.'}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === 'register' && (
            <label className="block">
              <span className="label">Display name</span>
              <div className="relative">
                <User className="text-ink-500 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <input className="field pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Server owner" />
              </div>
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <div className="relative">
              <Mail className="text-ink-500 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                className="field pl-9"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </label>
          <label className="block">
            <span className="label">Password</span>
            <div className="relative">
              <Lock className="text-ink-500 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                className="field pl-9"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </motion.p>
          )}

          <Button type="submit" className="w-full" size="lg" loading={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="text-ink-400 mt-6 text-center text-sm">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <Link to="/register" state={{ from }} className="text-brand-400 font-medium hover:underline">
                Register
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to="/login" state={{ from }} className="text-brand-400 font-medium hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
        {local && (
          <p className="border-ink-700 bg-ink-900/60 text-ink-500 mt-4 rounded-lg border px-3 py-2 text-center text-[11px]">
            Running in local mode: accounts and projects are stored in this browser. Configure Supabase to sync across devices.
          </p>
        )}
      </motion.div>
    </div>
  )
}
