import 'dotenv/config'
import cron from 'node-cron'
import { createSupabaseClient } from './lib/supabaseClient.js'
import { run } from './jobs/weeklyDigest.js'

const TIMEZONE = 'Europe/Rome'
const supabase = createSupabaseClient()

async function runJob() {
  const result = await run({ supabase })
  console.log('digest job result:', result)
}

cron.schedule('0 6 * * 1', runJob, { timezone: TIMEZONE })

console.log('automation: weekly digest scheduler running (Mon 06:00 Europe/Rome)')

// Catch-up: if the process starts after a missed Monday run (e.g. the Mac was
// off or asleep), run() applies the same dedupe check and fires immediately
// instead of waiting for next Monday.
runJob()
