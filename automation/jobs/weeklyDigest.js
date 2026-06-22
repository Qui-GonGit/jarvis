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
