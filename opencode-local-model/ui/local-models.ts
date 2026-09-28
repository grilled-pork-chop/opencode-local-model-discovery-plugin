/**
 * @module ui/local-models
 *
 * What the TUI knows about local models: which models are local, and how
 * their list changed.
 *
 * Pure functions, kept apart from `tui.ts` so they can be tested without a TUI.
 */

import { extractCompatibleProviders } from "../discovery/scanner"
import type { ProviderInfo } from "../types"

/** A discovered model as the TUI sees it. */
export interface LocalModel {
  readonly providerID: string
  /** The provider's display name, e.g. `"Local"`. */
  readonly providerName: string
  readonly id: string
}

/** A model as listed by the TUI's `ctx.data.location.model.list()`. */
interface ListedModel {
  readonly id: string
  readonly providerID: string
}

/** A toast announcing what changed in the local models. */
export interface ChangeToast {
  readonly message: string
  readonly variant: "info" | "warning"
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
    return providerName ? [{ providerID: model.providerID, providerName, id: model.id }] : []
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
