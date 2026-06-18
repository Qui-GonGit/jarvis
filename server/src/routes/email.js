import { Router } from 'express'
import {
  SCOPES,
  getOAuthClient,
  loadSavedTokens,
  saveTokens,
  listImportantUnread,
  getFullEmail,
  markEmailRead,
  trashEmail,
} from '../gmailClient.js'

const router = Router()

router.get('/status', async (req, res) => {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  const authorized = configured && Boolean(await loadSavedTokens())
  res.json({ configured, authorized })
})

router.get('/auth-url', (req, res) => {
  const oauth2Client = getOAuthClient()
  if (!oauth2Client) {
    return res.status(503).json({ error: 'Google OAuth credentials are not configured.' })
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  res.json({ url })
})

router.get('/oauth/callback', async (req, res) => {
  const oauth2Client = getOAuthClient()
  if (!oauth2Client) {
    return res.status(503).send('Google OAuth credentials are not configured.')
  }
  const { code } = req.query
  if (!code) {
    return res.status(400).send('Missing authorization code.')
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)
    await saveTokens(tokens)
    res.send('<html><body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">' +
      '<h2>JARVIS è ora collegato a Gmail.</h2><p>Puoi chiudere questa finestra.</p></body></html>')
  } catch (err) {
    console.error('Gmail OAuth callback error:', err.message)
    res.status(500).send('Authorization failed: ' + err.message)
  }
})

router.get('/important', async (req, res) => {
  try {
    const messages = await listImportantUnread()
    res.json({ count: messages.length, messages })
  } catch (err) {
    if (err.message === 'not_configured') {
      return res.status(503).json({ error: 'Google OAuth credentials are not configured.' })
    }
    if (err.message === 'not_authorized') {
      return res.status(401).json({ error: 'not_authorized' })
    }
    console.error('Gmail fetch error:', err.message)
    res.status(502).json({ error: 'Failed to fetch Gmail messages.' })
  }
})

router.get('/:id/full', async (req, res) => {
  try {
    res.json(await getFullEmail(req.params.id))
  } catch (err) {
    console.error('Gmail get full email error:', err.message)
    res.status(502).json({ error: 'Failed to fetch email content.' })
  }
})

router.post('/:id/read', async (req, res) => {
  try {
    res.json(await markEmailRead(req.params.id))
  } catch (err) {
    console.error('Gmail mark read error:', err.message)
    res.status(502).json({ error: 'Failed to mark email as read.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    res.json(await trashEmail(req.params.id))
  } catch (err) {
    console.error('Gmail delete error:', err.message)
    res.status(502).json({ error: 'Failed to delete email.' })
  }
})

export default router
