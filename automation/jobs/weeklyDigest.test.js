import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWithinCurrentWeek } from './weeklyDigest.js'

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
