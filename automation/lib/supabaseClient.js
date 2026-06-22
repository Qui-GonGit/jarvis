import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export function createSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not configured')
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY is not configured')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { realtime: { transport: ws } })
}
