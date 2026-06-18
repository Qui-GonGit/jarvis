import { Router } from 'express'

const router = Router()

const EXCHANGE_SUFFIXES = ['.MI', '.DE', '.L']
const resolvedSuffixCache = new Map()

function getTickers() {
  return (process.env.ETF_TICKERS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

async function fetchYahooQuote(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('No price data in response')
  }

  const price = meta.regularMarketPrice
  const previousClose = meta.chartPreviousClose ?? meta.previousClose
  const changePercent =
    typeof previousClose === 'number' && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : null

  return { price, currency: meta.currency ?? null, changePercent }
}

async function fetchTicker(ticker) {
  const cachedSuffix = resolvedSuffixCache.get(ticker)
  const suffixesToTry = cachedSuffix ? [cachedSuffix] : EXCHANGE_SUFFIXES

  for (const suffix of suffixesToTry) {
    try {
      const quote = await fetchYahooQuote(`${ticker}${suffix}`)
      resolvedSuffixCache.set(ticker, suffix)
      return { ticker, status: 'ok', ...quote }
    } catch {
      // try the next exchange suffix
    }
  }

  return { ticker, status: 'unavailable', price: null, currency: null, changePercent: null }
}

router.get('/', async (req, res) => {
  const etfs = await Promise.all(getTickers().map(fetchTicker))
  res.json({ etfs })
})

export default router
