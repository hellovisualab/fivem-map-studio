import type { HistoryEntry, Project, ProjectSummary, UserProfile } from '@/types'
import { idb } from '../idb'
import { readFileAsDataURL, todayKey, uid } from '../utils'
import type { Credentials, DataService } from './types'

interface StoredUser extends UserProfile {
  passwordHash: string
}

const SESSION_KEY = 'fms.session'

async function hash(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const stripUser = (u: StoredUser): UserProfile => {
  const { passwordHash: _ignored, ...rest } = u
  return rest
}

const summarize = (p: Project): ProjectSummary => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  thumbnail: p.thumbnail,
  preset: p.document.baseMap.preset,
  elementCount: p.document.elements.length,
  sizeBytes: JSON.stringify(p.document).length,
})

/**
 * Local-first implementation backed by IndexedDB. Used automatically when
 * Supabase credentials are not present so the studio works out of the box.
 */
export class LocalDataService implements DataService {
  readonly mode = 'local' as const
  private listeners = new Set<(u: UserProfile | null) => void>()

  private emit(u: UserProfile | null) {
    for (const l of this.listeners) l(u)
  }

  async getCurrentUser() {
    const id = localStorage.getItem(SESSION_KEY)
    if (!id) return null
    const u = await idb.get<StoredUser>('users', id)
    return u ? stripUser(u) : null
  }

  onAuthChange(cb: (user: UserProfile | null) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  async signIn({ email, password }: Credentials) {
    const users = await idb.getAll<StoredUser>('users')
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase())
    if (!u) throw new Error('No account found for that email.')
    if (u.passwordHash !== (await hash(password))) throw new Error('Incorrect password.')
    localStorage.setItem(SESSION_KEY, u.id)
    const profile = stripUser(u)
    this.emit(profile)
    return profile
  }

  async signUp({ email, password, displayName }: Credentials & { displayName: string }) {
    const users = await idb.getAll<StoredUser>('users')
    if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with that email already exists.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters.')
    const user: StoredUser = {
      id: uid(12),
      email,
      displayName: displayName || email.split('@')[0],
      plan: 'free',
      createdAt: new Date().toISOString(),
      exportsToday: 0,
      lastExportDate: todayKey(),
      storageUsed: 0,
      passwordHash: await hash(password),
    }
    await idb.put('users', user)
    localStorage.setItem(SESSION_KEY, user.id)
    const profile = stripUser(user)
    this.emit(profile)
    return profile
  }

  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    this.emit(null)
  }

  async updateProfile(userId: string, patch: Partial<UserProfile>) {
    const u = await idb.get<StoredUser>('users', userId)
    if (!u) throw new Error('User not found')
    const next = { ...u, ...patch, id: u.id }
    await idb.put('users', next)
    const profile = stripUser(next)
    this.emit(profile)
    return profile
  }

  async listProjects(ownerId: string) {
    const all = await idb.getAll<Project>('projects')
    return all
      .filter((p) => p.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarize)
  }

  async getProject(id: string) {
    return (await idb.get<Project>('projects', id)) ?? null
  }

  async createProject(project: Project) {
    await idb.put('projects', project)
    return project
  }

  async saveProject(project: Project) {
    await idb.put('projects', project)
  }

  async deleteProject(id: string) {
    await idb.delete('projects', id)
  }

  async listHistory(ownerId: string) {
    const all = await idb.getAll<HistoryEntry & { ownerId?: string }>('history')
    return all.filter((h) => h.ownerId === ownerId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200)
  }

  async addHistory(entry: HistoryEntry & { ownerId?: string }) {
    await idb.put('history', entry)
  }

  async uploadAsset(_ownerId: string, blob: Blob) {
    // Locally we inline assets as data URLs so projects remain self-contained.
    return readFileAsDataURL(blob)
  }
}
