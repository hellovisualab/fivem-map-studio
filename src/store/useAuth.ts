import { create } from 'zustand'
import type { PlanId, UserProfile } from '@/types'
import { getData } from '@/lib/data'
import { PLANS } from '@/lib/constants'
import { todayKey } from '@/lib/utils'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>
  setPlan: (plan: PlanId) => Promise<void>
  exportsRemaining: () => number | null
  recordExport: () => Promise<void>
}

let unsubscribe: (() => void) | null = null

/** Resets the daily export counter when the stored date is no longer today. */
function normalizeDaily(u: UserProfile): UserProfile {
  if (u.lastExportDate !== todayKey()) return { ...u, exportsToday: 0, lastExportDate: todayKey() }
  return u
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    const data = getData()
    try {
      const u = await data.getCurrentUser()
      set({ user: u ? normalizeDaily(u) : null, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
    unsubscribe?.()
    unsubscribe = data.onAuthChange((u) => set({ user: u ? normalizeDaily(u) : null }))
  },

  signIn: async (email, password) => {
    const u = await getData().signIn({ email, password })
    set({ user: normalizeDaily(u) })
  },

  signUp: async (email, password, displayName) => {
    const u = await getData().signUp({ email, password, displayName })
    set({ user: normalizeDaily(u) })
  },

  signOut: async () => {
    await getData().signOut()
    set({ user: null })
  },

  updateProfile: async (patch) => {
    const { user } = get()
    if (!user) return
    const next = await getData().updateProfile(user.id, patch)
    set({ user: next })
  },

  setPlan: async (plan) => {
    await get().updateProfile({ plan })
  },

  exportsRemaining: () => {
    const { user } = get()
    if (!user) return 0
    const limit = PLANS[user.plan].exportsPerDay
    if (limit === null) return null
    const u = normalizeDaily(user)
    return Math.max(0, limit - u.exportsToday)
  },

  recordExport: async () => {
    const { user } = get()
    if (!user) return
    const u = normalizeDaily(user)
    await get().updateProfile({ exportsToday: u.exportsToday + 1, lastExportDate: todayKey() })
  },
}))
