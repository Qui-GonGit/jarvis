import { Router } from 'express'

const router = Router()

const WEATHER_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  95: 'Thunderstorm',
}

router.get('/', async (req, res) => {
  const lat = req.query.lat || process.env.WEATHER_LAT || '41.9028'
  const lon = req.query.lon || process.env.WEATHER_LON || '12.4964'
  const city = process.env.WEATHER_CITY || 'Rome'
  const country = process.env.WEATHER_COUNTRY || 'IT'

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const current = data.current

    res.json({
      tempC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windMs: current.wind_speed_10m,
      condition: WEATHER_CODES[current.weather_code] ?? 'Unknown',
      city,
      country,
    })
  } catch (err) {
    console.error('Weather error:', err.message)
    res.status(502).json({ error: 'Failed to fetch weather' })
  }
})

export default router
