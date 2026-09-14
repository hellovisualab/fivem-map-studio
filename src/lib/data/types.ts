import type { HistoryEntry, Project, ProjectSummary, UserProfile } from '@/types'

export interface Credentials {
  email: string
  password: string
}

export interface DataService {
  readonly mode: 'supabase' | 'local'

  getCurrentUser(): Promise<UserProfile | null>
  onAuthChange(cb: (user: UserProfile | null) => void): () => void
  signIn(creds: Credentials): Promise<UserProfile>
  signUp(creds: Credentials & { displayName: string }): Promise<UserProfile>
  signOut(): Promise<void>
  updateProfile(userId: string, patch: Partial<UserProfile>): Promise<UserProfile>

  listProjects(ownerId: string): Promise<ProjectSummary[]>
  getProject(id: string): Promise<Project | null>
  createProject(project: Project): Promise<Project>
  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>

  listHistory(ownerId: string): Promise<HistoryEntry[]>
  addHistory(entry: HistoryEntry): Promise<void>

  /** Uploads an asset and returns a URL that can be used in an <img>. */
  uploadAsset(ownerId: string, blob: Blob, name: string): Promise<string>
}
