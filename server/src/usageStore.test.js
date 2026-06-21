import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { mergeUsage, createUsageStore } from './usageStore.js'

test('mergeUsage adds deltas to current totals', () => {
  const result = mergeUsage({ inputTokens: 10, outputTokens: 5 }, 3, 2)
  assert.deepEqual(result, { inputTokens: 13, outputTokens: 7 })
})

test('usageStore.read returns zeros when the file does not exist', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const store = createUsageStore(path.join(dir, 'usage.json'))

  const result = await store.read()

  assert.deepEqual(result, { inputTokens: 0, outputTokens: 0 })
  await rm(dir, { recursive: true, force: true })
})

test('usageStore.add persists accumulated totals across calls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const filePath = path.join(dir, 'usage.json')
  const store = createUsageStore(filePath)

  await store.add(100, 20)
  const second = await store.add(50, 10)

  assert.deepEqual(second, { inputTokens: 150, outputTokens: 30 })
  const onDisk = JSON.parse(await readFile(filePath, 'utf-8'))
  assert.deepEqual(onDisk, { inputTokens: 150, outputTokens: 30 })
  await rm(dir, { recursive: true, force: true })
})

test('usageStore.read recovers from a corrupt file instead of throwing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const filePath = path.join(dir, 'usage.json')
  const store = createUsageStore(filePath)
  await store.add(5, 5) // creates a valid file first

  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, 'not json{{{')

  const result = await store.read()

  assert.deepEqual(result, { inputTokens: 0, outputTokens: 0 })
  await rm(dir, { recursive: true, force: true })
})
