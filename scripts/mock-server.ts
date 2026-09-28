/**
 * A mock OpenAI-compatible server for trying the plugin by hand.
 *
 *   bun run mock                      # http://127.0.0.1:18080/v1
 *   MOCK_API_KEY=secret bun run mock  # require `Authorization: Bearer secret`
 *
 * `GET /v1/models` serves the models listed in `scripts/mock-models.json`
 * (created with two samples on first run). The file is re-read on every
 * request, so editing it is how you add or remove a model while OpenCode runs:
 * the plugin picks the change up on its next poll, within about 15 seconds.
 *
 * `POST /v1/chat/completions` answers every prompt with a fixed reply,
 * streamed or not, so a mock model can also be selected and chatted with.
 *
 * Environment: `MOCK_PORT` (default 18080), `MOCK_MODELS` (models file path),
 * `MOCK_API_KEY` (when set, requests without that bearer token get a 401).
 */

import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const port = Number(process.env.MOCK_PORT ?? 18080)
const modelsFile = process.env.MOCK_MODELS ?? join(import.meta.dir, "mock-models.json")
const apiKey = process.env.MOCK_API_KEY

const SAMPLE_MODELS = [
  { id: "llama3", object: "model", owned_by: "mock", max_model_len: 131072 },
  { id: "z-ai/glm-5.3", object: "model", owned_by: "mock" },
]

const REPLY = "Hello from the mock server! This reply is canned."

if (!existsSync(modelsFile)) {
  writeFileSync(modelsFile, `${JSON.stringify(SAMPLE_MODELS, null, 2)}\n`)
}

async function readModels(): Promise<unknown[]> {
  const parsed = JSON.parse(await Bun.file(modelsFile).text()) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${modelsFile} must contain a JSON array`)
  return parsed
}

function completion(model: string) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: REPLY },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 10, total_tokens: 11 },
  }
}

/** The same reply as server-sent events: one content chunk, a stop chunk, `[DONE]`. */
function completionStream(model: string): Response {
  const base = {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  }
  const events = [
    {
      ...base,
      choices: [{ index: 0, delta: { role: "assistant", content: REPLY }, finish_reason: null }],
    },
    {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 10, total_tokens: 11 },
    },
  ]
  const lines = [...events.map((event) => JSON.stringify(event)), "[DONE]"]
  const body = lines.map((line) => `data: ${line}\n\n`).join("")
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  })
}

function error(status: number, message: string): Response {
  return Response.json({ error: { message, type: "mock_error" } }, { status })
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname } = new URL(request.url)
    const authorized = !apiKey || request.headers.get("authorization") === `Bearer ${apiKey}`
    console.log(
      `${new Date().toISOString()} ${request.method} ${pathname}${authorized ? "" : " → 401"}`
    )
    if (!authorized) return error(401, "Invalid or missing API key")

    if (request.method === "GET" && pathname === "/v1/models") {
      try {
        return Response.json({ object: "list", data: await readModels() })
      } catch (cause) {
        return error(500, cause instanceof Error ? cause.message : String(cause))
      }
    }

    if (request.method === "POST" && pathname === "/v1/chat/completions") {
      const body = (await request.json().catch(() => ({}))) as { model?: string; stream?: boolean }
      const model = body.model ?? "mock"
      return body.stream ? completionStream(model) : Response.json(completion(model))
    }

    return error(404, `No mock route for ${request.method} ${pathname}`)
  },
})

console.log(`Mock OpenAI-compatible server on http://${server.hostname}:${server.port}/v1`)
console.log(`Models file: ${modelsFile} (edit it to add or remove models)`)
if (apiKey) console.log("Requests must send: Authorization: Bearer <MOCK_API_KEY>")
