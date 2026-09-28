/**
 * Structural views of the OpenCode V2 plugin API used by this plugin.
 *
 * They mirror `ModelEditor` and `Model.Info` from `@opencode/plugin` but
 * only name the members this plugin touches, with plain strings instead of
 * branded ids, so the modules stay testable without an OpenCode host.
 * @module
 */

/** Reasoning or request settings merged into a model or variant. */
export type ModelSettings = Record<string, unknown>

/** One selectable variant of a model, e.g. a reasoning effort level. */
export interface ModelVariant {
  id: string
  settings?: ModelSettings
}

/** The mutable model draft handed to `editor.models.update`. */
export interface ModelDraft {
  modelID: string
  name: string
  limit: { context: number; output: number; input?: number }
  settings?: ModelSettings
  variants: ModelVariant[]
}

/**
 * The part of V2's `ModelEditor` (the `ctx.model.transform` input) used here.
 *
 * Model transforms run on the final provider list, config providers included,
 * which provider transforms do not see yet. `update` creates a missing model
 * from OpenCode's defaults; both writes are no-ops for an unavailable provider.
 */
export interface ModelEditorLike {
  list(providerID?: string): readonly { readonly id: string }[]
  update(providerID: string, modelID: string, update: (model: ModelDraft) => void): void
  remove(providerID: string, modelID: string): void
  readonly default: {
    get(): { providerID: string; modelID: string } | undefined
    set(providerID: string, modelID: string): void
  }
}
