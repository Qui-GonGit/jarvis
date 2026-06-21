import { Client } from '@notionhq/client'

export function todayDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getClient() {
  const { NOTION_API_KEY } = process.env
  if (!NOTION_API_KEY) return null
  return new Client({ auth: NOTION_API_KEY })
}

export async function hasDigestBeenSentToday() {
  const client = getClient()
  const databaseId = process.env.NOTION_DIGEST_DB_ID
  if (!client || !databaseId) return false

  const response = await client.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        { property: 'Date', date: { equals: todayDateKey() } },
        { property: 'Status', select: { equals: 'sent' } },
      ],
    },
  })
  return response.results.length > 0
}

export async function logDigestSent() {
  const client = getClient()
  const databaseId = process.env.NOTION_DIGEST_DB_ID
  if (!client || !databaseId) return

  const todayKey = todayDateKey()
  await client.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Day: { title: [{ text: { content: todayKey } }] },
      Date: { date: { start: todayKey } },
      'Sent At': { date: { start: new Date().toISOString() } },
      Status: { select: { name: 'sent' } },
    },
  })
}
