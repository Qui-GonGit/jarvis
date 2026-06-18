import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { listImportantUnread, getFullEmail, markEmailRead, trashEmail } from '../gmailClient.js'

const router = Router()

const apiKey = process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

const SYSTEM_PROMPT =
  'You are J.A.R.V.I.S, a witty and efficient personal AI assistant inspired by Iron Man. ' +
  'The user you are assisting is named Niccolò; address him by name or as "sir", whichever fits ' +
  'naturally. Keep responses concise and conversational, suitable for being read aloud by a ' +
  'text-to-speech engine. You have tools to check the user\'s Gmail inbox: use them whenever the ' +
  'user asks about email, or at the start of a conversation if instructed to. When acting on a ' +
  'specific email (reading it in full, marking it read, deleting it), first make sure you know its ' +
  'id — call list_important_emails again if you are not sure which id matches the email the user means.'

const tools = [
  {
    name: 'list_important_emails',
    description:
      'Returns the user\'s important unread Gmail messages, each with an id, sender, subject, and short snippet. The id is required for read_email_full, mark_email_read, and delete_email.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_email_full',
    description: 'Fetches the full body text of a single Gmail message by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
  {
    name: 'mark_email_read',
    description: 'Marks a Gmail message as read (removes the unread label) by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_email',
    description: 'Moves a Gmail message to trash by id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message id' } },
      required: ['id'],
    },
  },
]

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'list_important_emails':
        return await listImportantUnread()
      case 'read_email_full':
        return await getFullEmail(input.id)
      case 'mark_email_read':
        return await markEmailRead(input.id)
      case 'delete_email':
        return await trashEmail(input.id)
      default:
        return { error: `Unknown tool ${name}` }
    }
  } catch (err) {
    return { error: err.message }
  }
}

router.post('/', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  try {
    let conversation = messages.map(({ role, content }) => ({ role, content }))

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: conversation,
    })

    let loopGuard = 0
    while (response.stop_reason === 'tool_use' && loopGuard < 5) {
      loopGuard += 1
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(await executeTool(block.name, block.input)),
        })),
      )

      conversation = [
        ...conversation,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: conversation,
      })
    }

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    res.json({ reply })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(502).json({ error: 'Failed to get a response from Claude.' })
  }
})

export default router
