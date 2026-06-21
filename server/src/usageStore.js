import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

export function mergeUsage(current, deltaInputTokens, deltaOutputTokens) {
  return {
    inputTokens: current.inputTokens + deltaInputTokens,
    outputTokens: current.outputTokens + deltaOutputTokens,
  }
}

export function createUsageStore(filePath) {
  let writeQueue = Promise.resolve()

  async function read() {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        inputTokens: Number(parsed.inputTokens) || 0,
        outputTokens: Number(parsed.outputTokens) || 0,
      }
    } catch {
      return { inputTokens: 0, outputTokens: 0 }
    }
  }

  function add(deltaInputTokens, deltaOutputTokens) {
    const result = writeQueue.then(async () => {
      const current = await read()
      const next = mergeUsage(current, deltaInputTokens, deltaOutputTokens)
      await mkdir(path.dirname(filePath), { recursive: true })
      const tmpPath = `${filePath}.tmp`
      await writeFile(tmpPath, JSON.stringify(next, null, 2))
      await rename(tmpPath, filePath)
      return next
    })
    // Never let a rejection poison the chain for subsequent calls — only this
    // call's own promise (returned below) should reject.
    writeQueue = result.catch(() => {})
    return result
  }

  return { read, add }
}
