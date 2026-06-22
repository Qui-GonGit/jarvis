import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SUBJECT_BODY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
})

export function parseClaudeOutput(rawStdout) {
  let parsed
  try {
    parsed = JSON.parse(rawStdout)
  } catch (err) {
    throw new Error(`claude CLI returned invalid JSON: ${err.message}`)
  }

  if (parsed.is_error) {
    throw new Error(`claude CLI reported an error: ${parsed.result ?? 'unknown error'}`)
  }

  const output = parsed.structured_output
  if (!output || typeof output.subject !== 'string' || typeof output.body !== 'string') {
    throw new Error('claude CLI output is missing structured subject/body')
  }

  return { subject: output.subject, body: output.body }
}

export async function run(prompt) {
  let stdout
  try {
    ;({ stdout } = await execFileAsync(
      'claude',
      ['-p', prompt, '--output-format', 'json', '--allowedTools', 'WebSearch', '--json-schema', SUBJECT_BODY_SCHEMA],
      { maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 },
    ))
  } catch (err) {
    throw new Error(`claude CLI exited with an error: ${err.stderr || err.message}`)
  }
  return parseClaudeOutput(stdout)
}
