import { google } from 'googleapis'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tokenPath = path.join(__dirname, '..', '..', 'server', 'vendor', 'gmail-token.json')

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID/SECRET not configured')
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

async function loadSavedTokens() {
  const raw = await readFile(tokenPath, 'utf-8')
  return JSON.parse(raw)
}

async function getGmailService() {
  const oauth2Client = getOAuthClient()
  const tokens = await loadSavedTokens()
  oauth2Client.setCredentials(tokens)
  return google.gmail({ version: 'v1', auth: oauth2Client })
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

export async function send({ subject, body }) {
  const gmail = await getGmailService()
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const to = profile.data.emailAddress
  const raw = buildRawMessage({ to, subject, body })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return { status: 'sent', to, subject }
}
