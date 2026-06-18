import { Router } from 'express'
import si from 'systeminformation'

const router = Router()
const GB = 1024 ** 3

router.get('/', async (req, res) => {
  try {
    const [load, mem, disks] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()])

    // On macOS, APFS exposes several synthetic volumes (System, VM, Preboot...)
    // backed by the same physical container — summing all of them would multiply
    // the real disk usage. Prefer the actual data volume, then root, then fall
    // back to the first entry with valid numbers (covers Linux/Windows single-mount setups).
    const validDisks = disks.filter((d) => typeof d.size === 'number' && typeof d.used === 'number')
    const primaryDisk =
      validDisks.find((d) => d.mount === '/System/Volumes/Data') ??
      validDisks.find((d) => d.mount === '/') ??
      validDisks[0]

    const diskUsedBytes = primaryDisk?.used ?? 0
    const diskTotalBytes = primaryDisk?.size ?? 0

    res.json({
      cpuPercent: load.currentLoad,
      ramPercent: (mem.active / mem.total) * 100,
      ramUsedGB: mem.active / GB,
      ramTotalGB: mem.total / GB,
      diskUsedGB: diskUsedBytes / GB,
      diskTotalGB: diskTotalBytes / GB,
    })
  } catch (err) {
    console.error('System stats error:', err.message)
    res.status(500).json({ error: 'Failed to read system stats' })
  }
})

export default router
