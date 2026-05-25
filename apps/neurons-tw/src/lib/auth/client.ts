// Supabase client singleton for neurons-tw cloud sync.
//
// Returns null when env vars are missing or VITE_CLOUD_SYNC_ENABLED=false —
// app stays fully playable in "auth disabled" mode (Dexie-only, no cloud).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined
const SYNC_ENABLED = import.meta.env.VITE_CLOUD_SYNC_ENABLED !== 'false'

let _client: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client

  if (!SYNC_ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (!SYNC_ENABLED) {
      console.info('[auth] VITE_CLOUD_SYNC_ENABLED=false → cloud sync disabled')
    } else {
      console.warn('[auth] Supabase env vars missing → cloud sync disabled')
    }
    _client = null
    return _client
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Distinct storageKey from medexam-tw / medexam2-hospital-tw so cookie
      // domain sharing doesn't cause cross-app session bleed even when all
      // three apps live under med-study-rpg.com.
      storageKey: 'neurons-rpg.auth',
    },
  })
  return _client
}

export function isAuthEnabled(): boolean {
  return getSupabase() !== null
}
