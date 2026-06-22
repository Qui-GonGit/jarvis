import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWithinCurrentWeek, run } from './weeklyDigest.js'

test('isWithinCurrentWeek is true for a timestamp earlier this same week', () => {
  // Monday 2026-06-22 is the start of this week; Wednesday is later in the same week.
  const now = '2026-06-24T10:00:00+02:00'
  const sentAt = '2026-06-22T06:05:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), true)
})

test('isWithinCurrentWeek is false for a timestamp from the previous week', () => {
  const now = '2026-06-24T10:00:00+02:00'
  const sentAt = '2026-06-15T06:05:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), false)
})

test('isWithinCurrentWeek is true exactly at the Monday 00:00 boundary', () => {
  const now = '2026-06-22T23:59:00+02:00'
  const sentAt = '2026-06-22T00:00:00+02:00'

  assert.equal(isWithinCurrentWeek(sentAt, now, 'Europe/Rome'), true)
})

function fakeSupabase({ selectResult = { data: [], error: null }, insertError = null, inserts = [] } = {}) {
  return {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return Promise.resolve(selectResult) },
        insert(row) {
          inserts.push(row)
          return Promise.resolve({ error: insertError })
        },
      }
    },
  }
}

test('run() skips and does not call claude/gmail when already sent this week', async () => {
  const now = new Date('2026-06-24T10:00:00+02:00')
  const supabase = fakeSupabase({
    selectResult: { data: [{ sent_at: '2026-06-22T06:05:00+02:00' }], error: null },
  })
  let claudeCalled = false
  let gmailCalled = false

  const result = await run({
    now,
    supabase,
    claudeCli: { run: async () => { claudeCalled = true; return { subject: 'S', body: 'B' } } },
    gmailSender: { send: async () => { gmailCalled = true } },
  })

  assert.deepEqual(result, { status: 'skipped', reason: 'already_sent' })
  assert.equal(claudeCalled, false)
  assert.equal(gmailCalled, false)
})

test('run() composes, sends, and logs sent when nothing was sent this week', async () => {
  const inserts = []
  const supabase = fakeSupabase({ inserts })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => ({ subject: 'Rassegna', body: 'Contenuto' }) },
    gmailSender: { send: async () => ({ status: 'sent' }) },
  })

  assert.deepEqual(result, { status: 'sent', subject: 'Rassegna' })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'sent')
  assert.equal(inserts[0].subject, 'Rassegna')
})

test('run() logs failed and returns failed when claude composition throws', async () => {
  const inserts = []
  const supabase = fakeSupabase({ inserts })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => { throw new Error('claude exploded') } },
    gmailSender: { send: async () => { throw new Error('should not be called') } },
  })

  assert.deepEqual(result, { status: 'failed', error: 'claude exploded' })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'failed')
  assert.equal(inserts[0].error, 'claude exploded')
})

test('run() skips without calling claude/gmail when the dedupe check itself fails', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return Promise.resolve({ data: null, error: new Error('network down') }) },
      }
    },
  }
  let claudeCalled = false

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => { claudeCalled = true; return { subject: 'S', body: 'B' } } },
    gmailSender: { send: async () => {} },
  })

  assert.deepEqual(result, { status: 'skipped', reason: 'dedupe_check_failed' })
  assert.equal(claudeCalled, false)
})

test('run() with force:true ignores dedupe even when already sent this week', async () => {
  const inserts = []
  const supabase = fakeSupabase({
    selectResult: { data: [{ sent_at: '2026-06-22T06:05:00+02:00' }], error: null },
    inserts,
  })

  const result = await run({
    force: true,
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => ({ subject: 'Rassegna', body: 'Contenuto' }) },
    gmailSender: { send: async () => ({ status: 'sent' }) },
  })

  assert.deepEqual(result, { status: 'sent', subject: 'Rassegna' })
})

test('run() still returns sent when the post-send log write fails', async () => {
  const supabase = fakeSupabase({ insertError: new Error('supabase write down') })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => ({ subject: 'Rassegna', body: 'Contenuto' }) },
    gmailSender: { send: async () => ({ status: 'sent' }) },
  })

  assert.deepEqual(result, { status: 'sent', subject: 'Rassegna' })
})

test('run() still returns the original failure when logging that failure also fails', async () => {
  const supabase = fakeSupabase({ insertError: new Error('supabase write down') })

  const result = await run({
    now: new Date('2026-06-24T10:00:00+02:00'),
    supabase,
    claudeCli: { run: async () => { throw new Error('claude exploded') } },
    gmailSender: { send: async () => { throw new Error('should not be called') } },
  })

  assert.deepEqual(result, { status: 'failed', error: 'claude exploded' })
})
