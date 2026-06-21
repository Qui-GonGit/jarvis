import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todayDateKey, hasDigestBeenSentToday, logDigestSent } from './notionDigestLog.js'

test('todayDateKey formats a date as YYYY-MM-DD', () => {
  const date = new Date(2026, 5, 21) // month is 0-indexed: 5 = June
  assert.equal(todayDateKey(date), '2026-06-21')
})

test('todayDateKey pads single-digit month and day', () => {
  const date = new Date(2026, 0, 3) // January 3rd
  assert.equal(todayDateKey(date), '2026-01-03')
})

test('hasDigestBeenSentToday returns false without network access when Notion is not configured', async () => {
  const originalKey = process.env.NOTION_API_KEY
  const originalDb = process.env.NOTION_DIGEST_DB_ID
  delete process.env.NOTION_API_KEY
  delete process.env.NOTION_DIGEST_DB_ID

  const result = await hasDigestBeenSentToday()
  assert.equal(result, false)

  if (originalKey !== undefined) process.env.NOTION_API_KEY = originalKey
  if (originalDb !== undefined) process.env.NOTION_DIGEST_DB_ID = originalDb
})

test('logDigestSent is a no-op without crashing when Notion is not configured', async () => {
  const originalKey = process.env.NOTION_API_KEY
  const originalDb = process.env.NOTION_DIGEST_DB_ID
  delete process.env.NOTION_API_KEY
  delete process.env.NOTION_DIGEST_DB_ID

  await assert.doesNotReject(() => logDigestSent())

  if (originalKey !== undefined) process.env.NOTION_API_KEY = originalKey
  if (originalDb !== undefined) process.env.NOTION_DIGEST_DB_ID = originalDb
})
