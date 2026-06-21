import { Router } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUsageStore } from '../usageStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const usageStore = createUsageStore(path.join(__dirname, '..', '..', 'data', 'usage.json'))

const router = Router()

router.get('/tokens', async (req, res) => {
  const { inputTokens, outputTokens } = await usageStore.read()
  res.json({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })
})

export default router
