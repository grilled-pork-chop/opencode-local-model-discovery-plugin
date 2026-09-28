/**
 * @module types
 *
 * The parts of OpenCode V2's model API this plugin touches.
 *
 * They mirror `ModelEditor` and `Model.Info` from `@opencode/plugin` with plain
 * strings instead of its branded ids, so the injector can be tested without an
 * OpenCode host.
 */

/** Reasoning or request settings merged into a model or variant. */
export type ModelSettings = Record<string, unknown>

/** One selectable variant of a model, e.g. a reasoning effort level. */
export interface ModelVariant {
  id: string
  settings?: ModelSettings
}

/** The mutable model draft handed to `editor.update`. */
export interface ModelDraft {
  modelID: string
  name: string
  limit: { context: number; output: number }
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

/** A provider as listed by `ctx.provider.list()`, reduced to what the scanner reads. */
export interface ProviderInfo {
  readonly id: string
  /** Display name, e.g. `"Local"`. */
  readonly name?: string
  readonly package: string
  /** Set on OpenCode's own providers; absent on those declared in the config. */
  readonly integrationID?: string
  /** V1 `options` land here: `baseURL`, `apiKey`, ... */
  readonly settings?: Readonly<Record<string, unknown>>
}
