import { isSupabaseConfigured } from '../supabase'
import { LocalDataService } from './local'
import { SupabaseDataService } from './supabase'
import type { DataService } from './types'

let service: DataService | null = null

export function getData(): DataService {
  if (!service) {
    service = isSupabaseConfigured ? new SupabaseDataService() : new LocalDataService()
  }
  return service
}

export type { DataService } from './types'
