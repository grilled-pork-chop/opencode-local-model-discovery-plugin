/**
 * @module discovery/known-models
 *
 * Static per-model config for things `/v1/models` does not report.
 *
 * An OpenAI-compatible server publishes ids and, at best, a context window. It
 * never says whether a model reasons or which effort levels it accepts, so
 * those are kept here and matched by id.
 *
 * To support a new model, add an entry. The first match wins, so put more
 * specific patterns first.
 *
 * Users can add their own entries in `known-models.json` next to their
 * OpenCode config (see {@link loadUserKnownModels}). They are appended after
 * these defaults, so a default always wins over a user entry for the same id.
 */

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/** A model id pattern and the config applied to every model it matches. */
interface KnownModel {
  readonly match: RegExp
  readonly config: Record<string, unknown>
}

const KNOWN_MODELS: readonly KnownModel[] = [
  {
    // glm-5.3-flash, GLM_5_3_Flash, z-ai/glm-5.3-flashx, ...
    // Natively multimodal: accepts images alongside text.
    match: /glm[\s._-]?5[\s._-]?3[\s._-]?flash/i,
    config: {
      reasoning: true,
      options: { reasoningEffort: "max" },
      variants: {
        low: { reasoningEffort: "low" },
        high: { reasoningEffort: "high" },
        max: { reasoningEffort: "max" },
      },
      attachment: true,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
    },
  },
  {
    // glm-5.3, GLM_5_3, z-ai/glm-5.3, ... (text-only)
    match: /glm[\s._-]?5[\s._-]?3/i,
    config: {
      reasoning: true,
      options: { reasoningEffort: "max" },
      variants: {
        low: { reasoningEffort: "low" },
        high: { reasoningEffort: "high" },
        max: { reasoningEffort: "max" },
      },
    },
  },
]

/** Entries read from the user's `known-models.json`, checked after {@link KNOWN_MODELS}. */
let userKnownModels: readonly KnownModel[] = []

/** Mirrors opencode's `Global.Path.config` (xdg-basedir, same on macOS/Windows). */
function userKnownModelsFile(): string {
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "opencode",
    "known-models.json"
  )
}

/**
 * Reads `~/.config/opencode/known-models.json` and appends its entries after
 * the defaults. Each entry has the same shape as a {@link KNOWN_MODELS} entry,
 * except `match` is a regex source string, matched case-insensitively:
 *
 * ```json
 * [{ "match": "qwen[\\s._-]?3[\\s._-]?vl", "config": { "attachment": true } }]
 * ```
 *
 * A missing file means no user entries. The file is re-read on every call, so
 * a config reload picks up edits instead of appending twice.
 *
 * @throws When the file is not valid JSON or an entry is malformed. Nothing
 *         from the file is applied in that case.
 */
export async function loadUserKnownModels(): Promise<void> {
  userKnownModels = []
  const path = userKnownModelsFile()
  const raw = await readFile(path, "utf8").catch(() => "")
  if (!raw.trim()) return

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} must contain an array of { match, config } entries`)
  }

  userKnownModels = parsed.map((entry, index) => parseEntry(entry, `${path} entry ${index}`))
}

/**
 * Turns one raw `known-models.json` entry into a {@link KnownModel}.
 *
 * @param entry - The parsed JSON value.
 * @param label - Names the entry in error messages.
 */
function parseEntry(entry: unknown, label: string): KnownModel {
  const { match, config } = (entry ?? {}) as { match?: unknown; config?: unknown }
  if (typeof match !== "string" || !config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${label} needs a string "match" and an object "config"`)
  }
  try {
    return { match: new RegExp(match, "i"), config: config as Record<string, unknown> }
  } catch (error) {
    throw new Error(`${label} has an invalid "match": ${(error as Error).message}`)
  }
}

/**
 * Returns the static config for a model id, or undefined when none matches.
 * The defaults are checked first, then the user's entries.
 *
 * @param id - The raw model ID reported by the server.
 */
export function knownModelConfig(id: string): Record<string, unknown> | undefined {
  return [...KNOWN_MODELS, ...userKnownModels].find((known) => known.match.test(id))?.config
}
