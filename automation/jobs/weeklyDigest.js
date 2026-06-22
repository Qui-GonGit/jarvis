import 'dotenv/config'
import { DateTime } from 'luxon'
import { createSupabaseClient } from '../lib/supabaseClient.js'
import * as claudeCli from '../lib/claudeCli.js'
import * as gmailSender from '../lib/gmailSender.js'

export const JOB_NAME = 'weekly-platform-engineering'
const TIMEZONE = 'Europe/Rome'

export const PROMPT =
  'Cerca sul web le novità più recenti (ultimi 2-3 giorni) nel mondo platform engineering, cloud, ' +
  'Kubernetes, SRE, DevOps e AI (modelli, tool, paper, framework). Seleziona al massimo 6-8 novità con ' +
  'il maggior potenziale come spunto per un articolo (Medium o rivista scientifica). Componi una sola ' +
  'email di rassegna: oggetto "Rassegna platform engineering & AI – {data di oggi}"; per ciascuna ' +
  'novità selezionata, titolo, breve riassunto (2-3 frasi), link alla fonte, e una nota "💡 spunto ' +
  'articolo" sulle voci più promettenti. Rispondi solo con l\'oggetto e il corpo dell\'email, nessun ' +
  'altro testo.'

export function isWithinCurrentWeek(sentAtIso, nowIso, timezone) {
  const now = DateTime.fromISO(nowIso, { zone: timezone })
  const weekStart = now.startOf('day').minus({ days: now.weekday - 1 })
  const sentAt = DateTime.fromISO(sentAtIso, { zone: timezone })
  return sentAt >= weekStart && sentAt <= now
}

async function alreadySentThisWeek(supabase, now) {
  const { data, error } = await supabase
    .from('digest_log')
    .select('sent_at')
    .eq('job_name', JOB_NAME)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)

  if (error) throw error
  if (!data || data.length === 0) return false
  return isWithinCurrentWeek(data[0].sent_at, now.toISOString(), TIMEZONE)
}

async function logResult(supabase, { status, subject, error }) {
  const { error: insertError } = await supabase.from('digest_log').insert({
    job_name: JOB_NAME,
    sent_at: new Date().toISOString(),
    subject: subject ?? null,
    status,
    error: error ?? null,
  })
  if (insertError) throw insertError
}

export async function run({
  force = false,
  now = new Date(),
  supabase,
  claudeCli: claudeCliDep = claudeCli,
  gmailSender: gmailSenderDep = gmailSender,
} = {}) {
  if (!force) {
    let skip
    try {
      skip = await alreadySentThisWeek(supabase, now)
    } catch (err) {
      console.error('digest: dedupe check failed, skipping this turn:', err.message)
      return { status: 'skipped', reason: 'dedupe_check_failed' }
    }
    if (skip) {
      console.log('digest: already sent this week, skipping')
      return { status: 'skipped', reason: 'already_sent' }
    }
  }

  let composed
  try {
    composed = await claudeCliDep.run(PROMPT)
    await gmailSenderDep.send(composed)
  } catch (err) {
    console.error('digest: failed:', err.message)
    try {
      await logResult(supabase, { status: 'failed', subject: composed?.subject, error: err.message })
    } catch (logErr) {
      console.error('digest: failed to log failure to Supabase:', logErr.message)
    }
    return { status: 'failed', error: err.message }
  }

  try {
    await logResult(supabase, { status: 'sent', subject: composed.subject })
  } catch (logErr) {
    console.error('digest: email sent but failed to log to Supabase:', logErr.message)
  }

  return { status: 'sent', subject: composed.subject }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force')
  const supabase = createSupabaseClient()
  run({ force, supabase }).then((result) => {
    console.log('digest job result:', result)
    process.exit(result.status === 'failed' ? 1 : 0)
  })
}
