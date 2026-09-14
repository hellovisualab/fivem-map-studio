import type { Session } from '@supabase/supabase-js'
import type { HistoryEntry, Project, ProjectSummary, UserProfile } from '@/types'
import { ASSETS_BUCKET, getSupabase } from '../supabase'
import { todayKey, uid } from '../utils'
import type { Credentials, DataService } from './types'

interface ProfileRow {
  id: string
  email: string
  display_name: string
  plan: 'free' | 'supporter'
  created_at: string
  exports_today: number
  last_export_date: string
  storage_used: number
}

interface ProjectRow {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
  thumbnail: string | null
  document: Project['document']
}

interface HistoryRow {
  id: string
  owner_id: string
  project_id: string
  project_name: string
  action: HistoryEntry['action']
  at: string
  detail: string | null
}

const rowToProfile = (r: ProfileRow): UserProfile => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  plan: r.plan,
  createdAt: r.created_at,
  exportsToday: r.exports_today,
  lastExportDate: r.last_export_date,
  storageUsed: r.storage_used,
})

const rowToProject = (r: ProjectRow): Project => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  thumbnail: r.thumbnail ?? undefined,
  document: r.document,
})

/** Supabase implementation: Postgres for users/projects/history, Storage for images. */
export class SupabaseDataService implements DataService {
  readonly mode = 'supabase' as const
  private sb = getSupabase()

  private async profileFor(session: Session | null): Promise<UserProfile | null> {
    if (!session?.user) return null
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) throw error
    if (data) return rowToProfile(data as ProfileRow)
    // First login: create the profile row.
    const row: ProfileRow = {
      id: session.user.id,
      email: session.user.email ?? '',
      display_name: (session.user.user_metadata?.display_name as string) || session.user.email?.split('@')[0] || 'Player',
      plan: 'free',
      created_at: new Date().toISOString(),
      exports_today: 0,
      last_export_date: todayKey(),
      storage_used: 0,
    }
    const { error: insErr } = await this.sb.from('profiles').insert(row)
    if (insErr) throw insErr
    return rowToProfile(row)
  }

  async getCurrentUser() {
    const { data } = await this.sb.auth.getSession()
    return this.profileFor(data.session)
  }

  onAuthChange(cb: (user: UserProfile | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      this.profileFor(session).then(cb).catch(() => cb(null))
    })
    return () => data.subscription.unsubscribe()
  }

  async signIn({ email, password }: Credentials) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const profile = await this.profileFor(data.session)
    if (!profile) throw new Error('Could not load profile')
    return profile
  }

  async signUp({ email, password, displayName }: Credentials & { displayName: string }) {
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw new Error(error.message)
    if (!data.session) {
      throw new Error('Check your inbox to confirm your email, then sign in.')
    }
    const profile = await this.profileFor(data.session)
    if (!profile) throw new Error('Could not create profile')
    return profile
  }

  async signOut() {
    await this.sb.auth.signOut()
  }

  async updateProfile(userId: string, patch: Partial<UserProfile>) {
    const row: Partial<ProfileRow> = {}
    if (patch.displayName !== undefined) row.display_name = patch.displayName
    if (patch.plan !== undefined) row.plan = patch.plan
    if (patch.exportsToday !== undefined) row.exports_today = patch.exportsToday
    if (patch.lastExportDate !== undefined) row.last_export_date = patch.lastExportDate
    if (patch.storageUsed !== undefined) row.storage_used = patch.storageUsed
    const { data, error } = await this.sb.from('profiles').update(row).eq('id', userId).select('*').single()
    if (error) throw new Error(error.message)
    return rowToProfile(data as ProfileRow)
  }

  async listProjects(ownerId: string): Promise<ProjectSummary[]> {
    const { data, error } = await this.sb
      .from('projects')
      .select('id,name,created_at,updated_at,thumbnail,document')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as ProjectRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      thumbnail: r.thumbnail ?? undefined,
      preset: r.document.baseMap.preset,
      elementCount: r.document.elements.length,
      sizeBytes: JSON.stringify(r.document).length,
    }))
  }

  async getProject(id: string) {
    const { data, error } = await this.sb.from('projects').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? rowToProject(data as ProjectRow) : null
  }

  async createProject(project: Project) {
    const { error } = await this.sb.from('projects').insert({
      id: project.id,
      owner_id: project.ownerId,
      name: project.name,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      thumbnail: project.thumbnail ?? null,
      document: project.document,
    })
    if (error) throw new Error(error.message)
    return project
  }

  async saveProject(project: Project) {
    const { error } = await this.sb
      .from('projects')
      .update({
        name: project.name,
        updated_at: project.updatedAt,
        thumbnail: project.thumbnail ?? null,
        document: project.document,
      })
      .eq('id', project.id)
    if (error) throw new Error(error.message)
  }

  async deleteProject(id: string) {
    const { error } = await this.sb.from('projects').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listHistory(ownerId: string) {
    const { data, error } = await this.sb
      .from('history')
      .select('*')
      .eq('owner_id', ownerId)
      .order('at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return (data as HistoryRow[]).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      action: r.action,
      at: r.at,
      detail: r.detail ?? undefined,
    }))
  }

  async addHistory(entry: HistoryEntry & { ownerId?: string }) {
    const { error } = await this.sb.from('history').insert({
      id: entry.id,
      owner_id: entry.ownerId,
      project_id: entry.projectId,
      project_name: entry.projectName,
      action: entry.action,
      at: entry.at,
      detail: entry.detail ?? null,
    })
    if (error) throw new Error(error.message)
  }

  async uploadAsset(ownerId: string, blob: Blob, name: string) {
    const ext = blob.type.split('/')[1] || 'png'
    const path = `${ownerId}/${uid(8)}-${name.replace(/[^a-z0-9._-]/gi, '_')}.${ext}`
    const { error } = await this.sb.storage.from(ASSETS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw new Error(error.message)
    const { data } = this.sb.storage.from(ASSETS_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }
}
