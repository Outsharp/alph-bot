import { execFile } from 'node:child_process'
import type { ShippEvent } from '../shipp-types.js'
import type { AiClient, AiClientOptions, MarketDescriptor } from './client.js'
import type { ProbabilityEstimate } from './schema.js'
import { probabilityEstimateJsonSchemaString, parseProbabilityEstimate } from './schema.js'
import { buildUserMessage, SYSTEM_PROMPT } from './anthropic.js'

/**
 * Execute a command and return stdout as a string.
 * Rejects if the process exits non-zero or times out.
 */
function exec(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message
        reject(new Error(`claude CLI failed: ${msg}`))
        return
      }
      resolve(stdout)
    })
    // Ensure stdin is closed so the process doesn't hang waiting for input
    child.stdin?.end()
  })
}

/**
 * Check whether the `claude` CLI is installed and authenticated.
 * Throws a descriptive error if either check fails.
 */
export async function assertClaudeCliReady(): Promise<void> {
  try {
    await exec('claude', ['--version'], 10_000)
  } catch {
    throw new Error(
      'The `claude` CLI is not installed or not on your PATH.\n' +
      'Install it: https://docs.anthropic.com/en/docs/claude-cli',
    )
  }

  // `claude auth status` exits 0 when authenticated
  try {
    const output = await exec('claude', ['auth', 'status'], 10_000)
    // Some versions print "not logged in" to stdout with exit 0
    if (/not (logged|authenticated)/i.test(output)) {
      throw new Error('not authenticated')
    }
  } catch {
    throw new Error(
      'The `claude` CLI is not authenticated. Run `claude auth login` first.',
    )
  }
}

/**
 * AI client that shells out to the `claude` CLI for inference.
 *
 * No API key required — the CLI manages its own authentication.
 * Uses `--print --output-format text --model <model> --prompt <prompt>`.
 *
 * The canonical JSON Schema from `schema.ts` is embedded directly in the
 * prompt so the model knows the exact shape to return, and responses are
 * validated through the shared Zod schema via `parseProbabilityEstimate()`.
 */
export class ClaudeCliClient implements AiClient {
  readonly name = 'claude-cli'

  private readonly model: string
  private readonly temperature: number

  constructor(opts: AiClientOptions) {
    this.model = opts.model
    this.temperature = opts.temperature
  }

  async estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: MarketDescriptor,
  ): Promise<ProbabilityEstimate> {
    const userMessage = buildUserMessage(sport, gameId, events, market)

    const prompt = `${SYSTEM_PROMPT}

---

${userMessage}

---

Respond with ONLY a JSON object (no markdown fences, no extra text) that conforms to the following JSON Schema:

${probabilityEstimateJsonSchemaString}`

    const args = [
      '--print',
      '--output-format', 'text',
      '--model', this.model,
      '--prompt', prompt,
    ]

    const stdout = await exec('claude', args)
    return this.parseResponse(stdout)
  }

  /**
   * Parse the JSON probability estimate from the CLI's stdout.
   *
   * Handles cases where the model wraps its response in markdown fences,
   * then validates through the canonical Zod schema. This guarantees the
   * returned object matches the same contract enforced by `AnthropicClient`'s
   * tool-use path.
   */
  private parseResponse(raw: string): ProbabilityEstimate {
    let text = raw.trim()

    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch?.[1]) {
      text = fenceMatch[1].trim()
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Last-ditch: try to find a JSON object in the output
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error(`claude CLI returned unparseable response:\n${raw.slice(0, 500)}`)
      }
      parsed = JSON.parse(jsonMatch[0])
    }

    // Validate through the shared Zod schema (throws ZodError on mismatch)
    return parseProbabilityEstimate(parsed)
  }
}