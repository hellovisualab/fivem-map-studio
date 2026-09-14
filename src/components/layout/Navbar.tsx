import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Sparkles, Wrench } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/store/useAuth'
import { getData } from '@/lib/data'

export function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const local = getData().mode === 'local'

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo to="/tools" />
        <nav className="flex items-center gap-2">
          {local && (
            <span className="hidden items-center gap-1 rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] font-medium text-ink-400 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Local mode
            </span>
          )}
          {user ? (
            <>
              <span className="hidden items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300 sm:inline-flex">
                <Sparkles className="h-3 w-3" /> {user.plan === 'supporter' ? 'Supporter' : 'Free'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/tools')}>
                <Wrench className="h-4 w-4" /> <span className="hidden sm:inline">Tools</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <LayoutDashboard className="h-4 w-4" /> <span className="hidden sm:inline">Minimap</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
              >
                <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-2 text-sm text-ink-300 transition hover:text-ink-100">
                Sign in
              </Link>
              <Button size="sm" onClick={() => navigate('/register')}>
                Get started
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
