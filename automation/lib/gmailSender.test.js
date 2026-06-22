import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRawMessage } from './gmailSender.js'

function decodeRaw(raw) {
  return Buffer.from(raw, 'base64url').toString('utf-8')
}

test('buildRawMessage includes To, Subject and body as plain text MIME', () => {
  const raw = buildRawMessage({ to: 'me@example.com', subject: 'Hello', body: 'Body text.' })
  const decoded = decodeRaw(raw)

  assert.match(decoded, /^To: me@example\.com\r\n/)
  assert.match(decoded, /Content-Type: text\/plain; charset=utf-8\r\n/)
  assert.match(decoded, /\r\n\r\nBody text\.$/)
})

test('buildRawMessage RFC2047-encodes a UTF-8 subject and round-trips correctly', () => {
  const subject = 'Rassegna è qui 💡'
  const raw = buildRawMessage({ to: 'me@example.com', subject, body: 'x' })
  const decoded = decodeRaw(raw)

  const match = decoded.match(/^Subject: =\?UTF-8\?B\?(.+)\?=\r\n/m)
  assert.ok(match, 'expected an RFC 2047 encoded Subject header')
  const decodedSubject = Buffer.from(match[1], 'base64').toString('utf-8')
  assert.equal(decodedSubject, subject)
})
