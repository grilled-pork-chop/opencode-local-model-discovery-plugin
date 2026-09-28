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
 */

import type { ModelSettings, ModelVariant } from "../types"

/** Config applied to a matching model, in OpenCode V2's model shape. */
export interface KnownModelConfig {
  /** Default request settings, e.g. `{ reasoningEffort: "max" }`. */
  readonly settings?: ModelSettings
  /** Selectable variants, each overriding the default settings. */
  readonly variants?: readonly ModelVariant[]
}

/** A model id pattern and the config applied to every model it matches. */
interface KnownModel {
  readonly match: RegExp
  readonly config: KnownModelConfig
}

const KNOWN_MODELS: readonly KnownModel[] = [
  {
    // glm-5.3, GLM_5_3, z-ai/glm-5.3-flash, ...
    match: /glm[\s._-]?5[\s._-]?3/i,
    config: {
      settings: { reasoningEffort: "max" },
      variants: [
        { id: "low", settings: { reasoningEffort: "low" } },
        { id: "high", settings: { reasoningEffort: "high" } },
        { id: "max", settings: { reasoningEffort: "max" } },
      ],
    },
  },
]

/**
 * Returns the static config for a model id, or undefined when none matches.
 *
 * @param id - The raw model ID reported by the server.
 */
export function knownModelConfig(id: string): KnownModelConfig | undefined {
  return KNOWN_MODELS.find((known) => known.match.test(id))?.config
}
