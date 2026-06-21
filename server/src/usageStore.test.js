import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
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

test('usageStore.add serializes concurrent calls and reflects all increments', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const filePath = path.join(dir, 'usage.json')
  const store = createUsageStore(filePath)

  // Fire 5 concurrent add() calls, each adding 1 input token and 0 output tokens
  const results = await Promise.all([
    store.add(1, 0),
    store.add(1, 0),
    store.add(1, 0),
    store.add(1, 0),
    store.add(1, 0),
  ])

  // The final result should reflect all 5 increments
  assert.deepEqual(results[results.length - 1], { inputTokens: 5, outputTokens: 0 })

  // Verify the file on disk also has the correct total
  const onDisk = JSON.parse(await readFile(filePath, 'utf-8'))
  assert.deepEqual(onDisk, { inputTokens: 5, outputTokens: 0 })

  await rm(dir, { recursive: true, force: true })
})

test('a failed add() does not poison subsequent add() calls on the same store instance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'usage-store-'))
  const blockerFile = path.join(dir, 'blocker')
  await writeFile(blockerFile, 'not a directory')
  // filePath's parent ("blocker") is a file, so mkdir(recursive) for it will fail
  const badFilePath = path.join(blockerFile, 'nested', 'usage.json')
  const store = createUsageStore(badFilePath)

  // First add() call should fail because mkdir will fail (ENOTDIR)
  await assert.rejects(
    () => store.add(1, 0),
    (err) => err.code === 'ENOTDIR' || err.code === 'EEXIST'
  )

  // Remove the blocker file so the next call can succeed
  await rm(blockerFile)

  // Second add() call on the SAME store instance must succeed without being poisoned
  const result = await store.add(5, 5)
  assert.deepEqual(result, { inputTokens: 5, outputTokens: 5 })

  // Verify the accumulated value is correct
  const onDisk = JSON.parse(await readFile(badFilePath, 'utf-8'))
  assert.deepEqual(onDisk, { inputTokens: 5, outputTokens: 5 })

  await rm(dir, { recursive: true, force: true })
})
