import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import chatRouter from './routes/chat.js'
import systemStatsRouter from './routes/systemStats.js'
import weatherRouter from './routes/weather.js'
import ttsRouter from './routes/tts.js'
import emailRouter from './routes/email.js'
import etfRouter from './routes/etf.js'
import usageRouter from './routes/usage.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    piperConfigured: true,
    gmailConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  })
})

app.use('/api/chat', chatRouter)
app.use('/api/system-stats', systemStatsRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/email', emailRouter)
app.use('/api/etf', etfRouter)
app.use('/api/usage', usageRouter)

app.listen(PORT, () => {
  console.log(`JARVIS backend listening on http://localhost:${PORT}`)
})
