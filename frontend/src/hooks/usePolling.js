import { useCallback, useEffect, useState } from 'react'

export function usePolling(url, { intervalMs = 5000 } = {}) {
  const [data, setData] = useState(null)
  const [online, setOnline] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchOnce()
    const id = setInterval(fetchOnce, intervalMs)
    return () => clearInterval(id)
  }, [fetchOnce, intervalMs])

  return { data, online, loading, refresh: fetchOnce }
}
