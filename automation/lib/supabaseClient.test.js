import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseClient } from './supabaseClient.js'

test('createSupabaseClient throws when SUPABASE_URL is missing', () => {
  const original = { ...process.env }
  delete process.env.SUPABASE_URL
  process.env.SUPABASE_SERVICE_KEY = 'fake-key'

  assert.throws(() => createSupabaseClient(), /SUPABASE_URL/)

  process.env = original
})

test('createSupabaseClient throws when SUPABASE_SERVICE_KEY is missing', () => {
  const original = { ...process.env }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  delete process.env.SUPABASE_SERVICE_KEY

  assert.throws(() => createSupabaseClient(), /SUPABASE_SERVICE_KEY/)

  process.env = original
})

test('createSupabaseClient returns a client when both env vars are set', () => {
  const original = { ...process.env }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'fake-key'

  const client = createSupabaseClient()

  assert.equal(typeof client.from, 'function')

  process.env = original
})
