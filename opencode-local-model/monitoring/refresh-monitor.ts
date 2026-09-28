/**
 * @module monitoring/refresh-monitor
 *
 * Polls the tracked providers and keeps their discovered model lists.
 */

import { POLL_INTERVAL_MS, sanitizeModelId } from "../constants"
import { type DiscoveredModel, fetchModels } from "../discovery/client"
import type { ProviderEntry } from "../discovery/scanner"
import { errorMessage, formatModels, log } from "../logger"

/** A provider to poll, with the credential resolved for it. */
export interface TrackedProvider {
  readonly provider: ProviderEntry
  readonly token?: string
}

/** Polling state of one tracked provider. */
interface ProviderState extends TrackedProvider {
  /** Last successfully fetched list; undefined until the first success. */
  models?: DiscoveredModel[]
  /** Last reported error, so a server that stays down is logged once. */
  lastError?: string
}

/**
 * Owns the discovered model lists and keeps them in sync with each provider.
 *
 * The model transform reads {@link discovered} and never fetches. This class
 * fetches, and whenever a list changes it calls `onChange`, which reloads
 * OpenCode's model registry so the transform runs again: new models appear
 * and removed ones disappear without a restart.
 *
 * Typical lifecycle:
 * 1. {@link track} the providers found in the config, then {@link poll} them.
 * 2. {@link start} the background polling.
 * 3. {@link cleanup} when the plugin is torn down.
 */
export class ModelRefreshMonitor {
  private providers = new Map<string, ProviderState>()
  private interval?: ReturnType<typeof setInterval>
  private polling = false

  /**
   * @param onChange - Reloads OpenCode's model registry after a list changed.
   * @param fetcher  - Fetches one provider's models, see {@link fetchModels}.
   */
  constructor(
    private readonly onChange: () => Promise<void>,
    private readonly fetcher: typeof fetchModels = fetchModels
  ) {}

  /**
   * Replaces the set of tracked providers. A provider whose URL and credential
   * are unchanged keeps its last list; a new or changed one starts empty until
   * it is polled. When a discovered list is dropped, the registry is reloaded
   * so its models disappear.
   *
   * @param providers - The providers currently declared in the config.
   * @returns The keys that started being tracked and those that stopped.
   */
  async track(
    providers: readonly TrackedProvider[]
  ): Promise<{ added: string[]; removed: string[] }> {
    const next = new Map<string, ProviderState>()
    const added: string[] = []
    let dropped = false

    for (const tracked of providers) {
      const key = tracked.provider.key
      const previous = this.providers.get(key)
      const unchanged =
        previous?.provider.baseUrl === tracked.provider.baseUrl && previous.token === tracked.token
      if (unchanged) {
        next.set(key, { ...previous, ...tracked })
      } else {
        next.set(key, { ...tracked })
        added.push(key)
        if (previous?.models) dropped = true
      }
    }

    const removed = [...this.providers.keys()].filter((key) => !next.has(key))
    if (removed.some((key) => this.providers.get(key)?.models)) dropped = true

    this.providers = next
    if (dropped) await this.onChange()
    return { added, removed }
  }

  /** The tracked providers that have a discovered list, by provider key. */
  discovered(): ReadonlyMap<string, readonly DiscoveredModel[]> {
    const lists = new Map<string, readonly DiscoveredModel[]>()
    for (const [key, state] of this.providers) {
      if (state.models) lists.set(key, state.models)
    }
    return lists
  }

  /** The first discovered model, used as the default when none is set. */
  firstModel(): { key: string; id: string } | undefined {
    for (const [key, models] of this.discovered()) {
      if (models[0]) return { key, id: models[0].id }
    }
    return undefined
  }

  /**
   * Fetches the given providers, or all of them, and reloads the registry once
   * if any list changed.
   *
   * @param keys - Provider keys to poll; every tracked provider when omitted.
   */
  async poll(keys: readonly string[] = [...this.providers.keys()]): Promise<void> {
    const states = keys.flatMap((key) => this.providers.get(key) ?? [])
    const changed = await Promise.all(states.map((state) => this.refresh(state)))
    if (changed.some(Boolean)) await this.onChange()
  }

  /**
   * Starts polling every {@link POLL_INTERVAL_MS}. A tick is skipped while the
   * previous one is still running. Calling it again is a no-op.
   */
  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
    // Polling must not hold a short-lived process (`opencode run`) open past its work.
    this.interval.unref?.()
  }

  /** Stops polling. Safe to call when polling never started. */
  cleanup(): void {
    clearInterval(this.interval)
    this.interval = undefined
  }

  /** One background poll, skipped while the previous one is still running. */
  private async tick(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      await this.poll()
    } catch (error) {
      log.error(`Failed to reload models: ${errorMessage(error)}`)
    } finally {
      this.polling = false
    }
  }

  /**
   * Fetches one provider and records the result. A failure keeps the last
   * list, so a server that is briefly down does not lose its models.
   *
   * @param state - The provider to fetch.
   * @returns Whether its list changed.
   */
  private async refresh(state: ProviderState): Promise<boolean> {
    const key = state.provider.key
    let models: DiscoveredModel[]
    try {
      models = await this.fetcher(state.provider.baseUrl, state.token)
    } catch (error) {
      const message = errorMessage(error)
      if (message !== state.lastError) {
        log.error(`Model discovery failed for provider "${key}": ${message}`)
      }
      state.lastError = message
      return false
    }

    if (state.lastError) log.info(`Provider "${key}" is reachable again`)
    state.lastError = undefined

    const previous = state.models
    if (previous && JSON.stringify(previous) === JSON.stringify(models)) return false
    state.models = models
    if (previous) logChanges(key, previous, models)
    else logDiscovered(key, models)
    return true
  }
}

/**
 * Logs the first list discovered for a provider.
 *
 * @param key    - The provider key.
 * @param models - The discovered models.
 */
function logDiscovered(key: string, models: readonly DiscoveredModel[]): void {
  if (models.length === 0) {
    log.warning(`No models found for provider "${key}"`)
    return
  }
  log.info(`Discovered ${models.length} model(s) for provider "${key}": ${formatModels(models)}`)
}

/**
 * Logs one line per model added to or removed from a provider.
 *
 * @param key      - The provider key.
 * @param previous - The list before the poll.
 * @param current  - The list after the poll.
 */
function logChanges(
  key: string,
  previous: readonly DiscoveredModel[],
  current: readonly DiscoveredModel[]
): void {
  const before = new Set(previous.map((model) => model.id))
  const after = new Set(current.map((model) => model.id))
  for (const id of after) {
    if (!before.has(id)) {
      log.info(`New model "${sanitizeModelId(id)}" discovered for provider "${key}"`)
    }
  }
  for (const id of before) {
    if (!after.has(id)) {
      log.warning(`Model "${sanitizeModelId(id)}" removed from provider "${key}"`)
    }
  }
}
