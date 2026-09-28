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

/** A model id pattern and the config applied to every model it matches. */
interface KnownModel {
  readonly match: RegExp
  readonly config: Record<string, unknown>
}

const KNOWN_MODELS: readonly KnownModel[] = [
  {
    // glm-5.3, GLM_5_3, z-ai/glm-5.3-flash, ...
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

/**
 * Returns the static config for a model id, or undefined when none matches.
 *
 * @param id - The raw model ID reported by the server.
 */
export function knownModelConfig(id: string): Record<string, unknown> | undefined {
  return KNOWN_MODELS.find((known) => known.match.test(id))?.config
}
