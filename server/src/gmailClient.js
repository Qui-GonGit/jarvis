import { google } from 'googleapis'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tokenPath = path.join(__dirname, '..', 'vendor', 'gmail-token.json')

export const SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

export function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

export async function loadSavedTokens() {
  try {
    return JSON.parse(await readFile(tokenPath, 'utf-8'))
  } catch {
    return null
  }
}

export async function saveTokens(tokens) {
  await mkdir(path.dirname(tokenPath), { recursive: true })
  await writeFile(tokenPath, JSON.stringify(tokens, null, 2))
}

export async function getGmailService() {
  const oauth2Client = getOAuthClient()
  if (!oauth2Client) throw new Error('not_configured')

  const tokens = await loadSavedTokens()
  if (!tokens) throw new Error('not_authorized')

  oauth2Client.setCredentials(tokens)
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function listImportantUnread(maxResults = 5) {
  const gmail = await getGmailService()

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:important is:unread',
    maxResults,
  })

  const messages = list.data.messages ?? []
  return Promise.all(
    messages.map(async ({ id }) => {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From'],
      })
      const headers = msg.data.payload?.headers ?? []
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(nessun oggetto)'
      const from = headers.find((h) => h.name === 'From')?.value ?? 'Mittente sconosciuto'
      return { id, from, subject, snippet: msg.data.snippet }
    }),
  )
}

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64url').toString('utf-8')
}

function extractBody(payload) {
  if (!payload) return ''

  if (payload.body?.data && (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html')) {
    return decodeBase64Url(payload.body.data)
  }

  if (payload.parts) {
    const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (plainPart?.body?.data) return decodeBase64Url(plainPart.body.data)

    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }

    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

export async function getFullEmail(id) {
  const gmail = await getGmailService()
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const headers = msg.data.payload?.headers ?? []
  const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(nessun oggetto)'
  const from = headers.find((h) => h.name === 'From')?.value ?? 'Mittente sconosciuto'
  const body = extractBody(msg.data.payload).slice(0, 4000)
  return { id, from, subject, body }
}

export async function markEmailRead(id) {
  const gmail = await getGmailService()
  await gmail.users.messages.modify({
    userId: 'me',
    id,
    requestBody: { removeLabelIds: ['UNREAD'] },
  })
  return { id, status: 'read' }
}

export async function trashEmail(id) {
  const gmail = await getGmailService()
  await gmail.users.messages.trash({ userId: 'me', id })
  return { id, status: 'trashed' }
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

export function buildRawMessage({ to, subject, body }) {
  const message = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message, 'utf-8').toString('base64url')
}

export async function getMyEmailAddress() {
  const gmail = await getGmailService()
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data.emailAddress
}

export async function sendDigestEmail({ subject, body }) {
  const gmail = await getGmailService()
  const to = await getMyEmailAddress()
  const raw = buildRawMessage({ to, subject, body })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return { status: 'sent', to, subject }
}
