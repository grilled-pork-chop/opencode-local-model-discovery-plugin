/**
 * @module ui/local-models
 *
 * What the TUI shows about local models: which models are local, how their
 * list changed, and the entries of the `/local-models` dialog.
 *
 * Pure functions, kept apart from `tui.ts` so they can be tested without a TUI.
 */

import { extractCompatibleProviders } from "../discovery/scanner"
import { formatTokens } from "../logger"
import type { ProviderInfo } from "../types"

/** A discovered model as the TUI shows it. */
export interface LocalModel {
  readonly providerID: string
  /** The provider's display name, e.g. `"Local"`. */
  readonly providerName: string
  readonly id: string
  /** Context window in tokens, when the server reported one. */
  readonly context?: number
}

/** A model as listed by the TUI's `ctx.data.location.model.list()`. */
interface ListedModel {
  readonly id: string
  readonly providerID: string
  readonly limit: { readonly context: number }
}

/** A toast announcing what changed in the local models. */
export interface ChangeToast {
  readonly message: string
  readonly variant: "info" | "warning"
}

/** What the user picked in the `/local-models` dialog. */
export type LocalModelChoice =
  | { readonly type: "model"; readonly providerID: string; readonly modelID: string }
  | { readonly type: "refresh" }

/** One entry of the `/local-models` dialog, in `ctx.ui.dialog.select` form. */
export interface LocalModelOption {
  readonly title: string
  readonly value: LocalModelChoice
  readonly description?: string
  readonly footer?: string
  readonly category?: string
  readonly disabled?: boolean
}

/**
 * Keeps the models of the providers this plugin discovers, using the same
 * rules as the server plugin (see {@link extractCompatibleProviders}).
 *
 * @param providers - The TUI's provider list.
 * @param models    - The TUI's model list.
 * @returns The local models, in the order OpenCode lists them.
 */
export function localModels(
  providers: readonly ProviderInfo[],
  models: readonly ListedModel[]
): LocalModel[] {
  const names = new Map(
    extractCompatibleProviders(providers).map(({ key }) => {
      const name = providers.find((provider) => provider.id === key)?.name
      return [key, name || key]
    })
  )
  return models.flatMap((model) => {
    const providerName = names.get(model.providerID)
    if (!providerName) return []
    const context = model.limit.context > 0 ? model.limit.context : undefined
    return [
      { providerID: model.providerID, providerName, id: model.id, ...(context ? { context } : {}) },
    ]
  })
}

/**
 * Describes how the local models changed, as one toast: OpenCode shows a
 * single toast at a time, so a new one would hide the previous. Each provider
 * gets at most one line for added and one for removed models, and a
 * provider's first models get a single "available" summary.
 *
 * @param previous - The models before the change.
 * @param current  - The models after the change.
 * @returns The toast to show, or `undefined` when nothing changed.
 */
export function changeToast(
  previous: readonly LocalModel[],
  current: readonly LocalModel[]
): ChangeToast | undefined {
  const providers = new Map([...previous, ...current].map((model) => [model.providerID, model]))
  const added: string[] = []
  const removed: string[] = []

  for (const { providerID, providerName: name } of providers.values()) {
    const before = previous.filter((model) => model.providerID === providerID).map((m) => m.id)
    const after = current.filter((model) => model.providerID === providerID).map((m) => m.id)
    const gained = after.filter((id) => !before.includes(id))
    const lost = before.filter((id) => !after.includes(id))

    if (before.length === 0 && gained.length > 0) {
      added.push(`${gained.length} model(s) available on ${name}`)
    } else if (gained.length === 1) {
      added.push(`${gained[0]} is now available on ${name}`)
    } else if (gained.length > 1) {
      added.push(`${gained.length} new models on ${name}: ${gained.join(", ")}`)
    }
    if (lost.length === 1) {
      removed.push(`${lost[0]} was removed from ${name}`)
    } else if (lost.length > 1) {
      removed.push(`${lost.length} models removed from ${name}: ${lost.join(", ")}`)
    }
  }

  if (added.length === 0 && removed.length === 0) return undefined
  return {
    message: [...added, ...removed].join("\n"),
    variant: added.length > 0 ? "info" : "warning",
  }
}

/**
 * Builds the `/local-models` dialog: one entry per model, grouped by provider
 * and showing only its id and context size, then a refresh entry.
 *
 * @param models - The local models.
 * @returns The dialog entries.
 */
export function modelOptions(models: readonly LocalModel[]): LocalModelOption[] {
  const refresh: LocalModelOption = { title: "↻ Refresh now", value: { type: "refresh" } }
  if (models.length === 0) {
    return [
      {
        title: "No local model found",
        description: "Add an OpenAI-compatible provider with a baseURL to your config",
        value: { type: "refresh" },
        disabled: true,
      },
      refresh,
    ]
  }
  const entries = models.map(
    (model): LocalModelOption => ({
      title: model.id,
      value: { type: "model", providerID: model.providerID, modelID: model.id },
      category: model.providerName,
      ...(model.context ? { footer: formatTokens(model.context) } : {}),
    })
  )
  return [...entries, refresh]
}
