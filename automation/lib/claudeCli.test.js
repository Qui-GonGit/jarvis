import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClaudeOutput } from './claudeCli.js'

test('parseClaudeOutput extracts subject/body from structured_output', () => {
  const raw = JSON.stringify({
    is_error: false,
    result: 'Done.',
    structured_output: { subject: 'Rassegna', body: 'Contenuto della rassegna.' },
  })

  const result = parseClaudeOutput(raw)

  assert.deepEqual(result, { subject: 'Rassegna', body: 'Contenuto della rassegna.' })
})

test('parseClaudeOutput throws when claude reports is_error', () => {
  const raw = JSON.stringify({ is_error: true, result: 'something went wrong' })

  assert.throws(() => parseClaudeOutput(raw), /something went wrong/)
})

test('parseClaudeOutput throws when structured_output is missing', () => {
  const raw = JSON.stringify({ is_error: false, result: 'Done.' })

  assert.throws(() => parseClaudeOutput(raw), /missing structured subject\/body/)
})

test('parseClaudeOutput throws when stdout is not valid JSON', () => {
  assert.throws(() => parseClaudeOutput('not json'), /invalid JSON/)
})
