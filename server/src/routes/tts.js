import { Router } from 'express'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, unlink, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const vendorDir = path.join(__dirname, '..', '..', 'vendor')

const PIPER_PYTHON = path.join(vendorDir, 'piper-venv', 'bin', 'python')
const PIPER_MODEL = path.join(vendorDir, 'piper-voices', 'it_IT-riccardo-x_low.onnx')
const PIPER_CONFIG = path.join(vendorDir, 'piper-voices', 'it_IT-riccardo-x_low.onnx.json')

const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY
// "Daniel": deep, calm voice with a hint of an English accent — closest
// premade ElevenLabs voice to the JARVIS movie tone.
const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'

async function synthesizeWithPiper(text) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jarvis-tts-'))
  const outputFile = path.join(dir, 'speech.wav')

  await new Promise((resolve, reject) => {
    const child = spawn(PIPER_PYTHON, [
      '-m', 'piper',
      '-m', PIPER_MODEL,
      '-c', PIPER_CONFIG,
      '-f', outputFile,
    ])
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`piper exited with code ${code}: ${stderr}`))
    })
    child.stdin.write(text)
    child.stdin.end()
  })

  const audioBuffer = await readFile(outputFile)
  await unlink(outputFile).catch(() => {})
  return { buffer: audioBuffer, contentType: 'audio/wav' }
}

async function synthesizeWithElevenLabs(text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': elevenLabsApiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`ElevenLabs API error ${response.status}: ${detail}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return { buffer, contentType: 'audio/mpeg' }
}

router.post('/', async (req, res) => {
  const { text } = req.body
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' })
  }

  if (elevenLabsApiKey) {
    try {
      const { buffer, contentType } = await synthesizeWithElevenLabs(text)
      res.set('Content-Type', contentType)
      return res.send(buffer)
    } catch (err) {
      console.error('ElevenLabs TTS error, falling back to Piper:', err.message)
    }
  }

  try {
    const { buffer, contentType } = await synthesizeWithPiper(text)
    res.set('Content-Type', contentType)
    return res.send(buffer)
  } catch (err) {
    console.error('Piper fallback error:', err.message)
  }

  res.status(503).json({ error: 'No TTS engine available on the server.' })
})

export default router
