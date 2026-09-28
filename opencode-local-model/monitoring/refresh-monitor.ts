import { POLL_INTERVAL_MS, simplifyModelId } from "../constants"
import type { DiscoveredModel } from "../discovery/client"
import { fetchModels } from "../discovery/client"
import type { ProviderEntry } from "../discovery/scanner"
import { type Logger, log } from "../logger"

/** A provider to poll, with the credential resolved for it. */
export interface TrackedProvider {
  readonly provider: ProviderEntry
  readonly token?: string
}

/** Fetches the model list of one provider, see {@link fetchModels}. */
export type Fetcher = (baseUrl: string, token?: string) => Promise<DiscoveredModel[]>

interface ProviderState extends TrackedProvider {
  /** Last successfully fetched list; undefined until the first success. */
  models?: DiscoveredModel[]
  /** Serialized {@link models}, compared to detect any change. */
  hash?: string
  /** Last reported error, so a server that stays down is logged once. */
  lastError?: string
}

/**
 * How long one server's answer is shared. OpenCode V2 runs one plugin instance
 * per open project, all polling the same servers; they share a request made
 * within this window instead of each fetching. It is shorter than the poll
 * interval so an instance never reuses its own previous answer.
 */
const SHARED_TTL_MS = POLL_INTERVAL_MS / 2

const shared = new Map<string, { checked: number; request: Promise<DiscoveredModel[]> }>()

/** Forgets every shared answer. Used by tests. */
export function clearSharedDiscovery(): void {
  shared.clear()
}

function sharedFetch(fetcher: Fetcher, baseUrl: string, token?: string) {
  const key = `${baseUrl}\n${token ?? ""}`
  const cached = shared.get(key)
  if (cached && Date.now() - cached.checked < SHARED_TTL_MS) return cached.request
  const request = fetcher(baseUrl, token)
  shared.set(key, { checked: Date.now(), request })
  return request
}

/**
 * Owns the discovered model lists and keeps them in sync with each provider.
 *
 * The provider transform reads {@link discovered} and never fetches. This
 * class fetches, and when any list changes it calls `onChange`, which reloads
 * OpenCode's provider registry so the transform runs again with the new
 * lists: new models appear and removed ones disappear without a restart.
 *
 * Typical lifecycle:
 * 1. {@link track} the providers found in the config.
 * 2. {@link refreshAll} once, then {@link start} the background polling.
 * 3. {@link cleanup} when the plugin is torn down.
 */
export class ModelRefreshMonitor {
  private states = new Map<string, ProviderState>()
  private interval?: ReturnType<typeof setInterval>
  private running?: Promise<boolean>
  private queued?: Promise<boolean>

  /**
   * @param onChange - Called once after a refresh that changed any list.
   * @param logger   - Where discoveries, changes and errors are reported.
   * @param fetcher  - Fetches one provider's models.
   */
  constructor(
    private readonly onChange: () => Promise<void>,
    private readonly logger: Logger = log,
    private readonly fetcher: Fetcher = fetchModels
  ) {}

  /**
   * Replaces the set of polled providers. A provider whose URL and credential
   * are unchanged keeps its last list; any other starts empty.
   *
   * @returns `changed` when a provider was added, removed or re-pointed, so
   *          it needs a refresh; `dropped` when a discovered list was thrown
   *          away, so the registry must be reloaded for that to show.
   */
  track(providers: readonly TrackedProvider[]): { changed: boolean; dropped: boolean } {
    const next = new Map<string, ProviderState>()
    let changed = false
    let dropped = false
    for (const tracked of providers) {
      const previous = this.states.get(tracked.provider.key)
      const same =
        previous?.provider.baseUrl === tracked.provider.baseUrl && previous.token === tracked.token
      if (same) {
        next.set(tracked.provider.key, { ...previous, ...tracked })
        continue
      }
      changed = true
      if (previous?.models) dropped = true
      next.set(tracked.provider.key, { ...tracked })
    }
    for (const [key, state] of this.states) {
      if (next.has(key)) continue
      changed = true
      if (state.models) dropped = true
    }
    this.states = next
    return { changed, dropped }
  }

  /** Ids of the tracked providers. */
  keys(): string[] {
    return [...this.states.keys()]
  }

  /** Every provider with a discovered list, for the provider transform. */
  discovered(): [string, readonly DiscoveredModel[]][] {
    return [...this.states].flatMap(([key, state]) => (state.models ? [[key, state.models]] : []))
  }

  /** The first discovered model, used as the default when none is set. */
  firstModel(): { providerID: string; modelID: string } | undefined {
    for (const [key, models] of this.discovered()) {
      if (models[0]) return { providerID: key, modelID: models[0].id }
    }
    return undefined
  }

  /**
   * Fetches every tracked provider and calls `onChange` once if any list
   * changed. A call made while a refresh runs queues one more refresh after
   * it, shared by every such call, so providers tracked in the meantime are
   * fetched without waiting for the next poll.
   *
   * @returns Whether any list changed.
   */
  refreshAll(): Promise<boolean> {
    if (!this.running) {
      this.running = this.runAll().finally(() => {
        this.running = undefined
      })
      return this.running
    }
    this.queued ??= this.running.then(() => {
      this.queued = undefined
      return this.refreshAll()
    })
    return this.queued
  }

  /**
   * Starts polling every {@link POLL_INTERVAL_MS}. Calling it again is a no-op.
   */
  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => void this.refreshAll(), POLL_INTERVAL_MS)
    // Polling must not hold a short-lived process (`opencode run`) open past its work.
    this.interval.unref?.()
  }

  /** Stops polling. Safe to call when polling never started. */
  cleanup(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = undefined
  }

  private async runAll(): Promise<boolean> {
    const results = await Promise.all([...this.states.values()].map((state) => this.refresh(state)))
    const changed = results.some(Boolean)
    if (changed) {
      await this.onChange().catch((error) => {
        this.logger.error(`Failed to reload providers: ${message(error)}`)
      })
    }
    return changed
  }

  /**
   * Fetches one provider and records the result.
   *
   * @returns Whether its list changed.
   */
  private async refresh(state: ProviderState): Promise<boolean> {
    const key = state.provider.key
    let models: DiscoveredModel[]
    try {
      models = await sharedFetch(this.fetcher, state.provider.baseUrl, state.token)
    } catch (error) {
      const text = message(error)
      if (text !== state.lastError) {
        this.logger.error(`Model discovery failed for provider "${key}": ${text}`)
      }
      state.lastError = text
      return false
    }

    if (state.lastError) this.logger.info(`Provider "${key}" is reachable again`)
    state.lastError = undefined

    const hash = JSON.stringify(models)
    if (hash === state.hash) return false
    const previous = state.models
    state.models = models
    state.hash = hash

    if (previous) this.logChanges(key, previous, models)
    else this.logDiscovered(key, models)
    return true
  }

  private logDiscovered(key: string, models: readonly DiscoveredModel[]): void {
    if (models.length === 0) {
      this.logger.warning(`No models found for provider "${key}"`)
      return
    }
    this.logger.info(
      `Discovered ${models.length} model(s) for provider "${key}":\n${formatModelList(models)}`
    )
  }

  private logChanges(
    key: string,
    previous: readonly DiscoveredModel[],
    current: readonly DiscoveredModel[]
  ): void {
    const before = new Set(previous.map((model) => model.id))
    const after = new Set(current.map((model) => model.id))
    for (const id of after) {
      if (!before.has(id)) {
        this.logger.info(`New model "${simplifyModelId(id)}" discovered for provider "${key}"`)
      }
    }
    for (const id of before) {
      if (!after.has(id)) {
        this.logger.warning(`Model "${simplifyModelId(id)}" removed from provider "${key}"`)
      }
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Formats discovered models into a bullet-pointed list, annotating each with
 * its context window when the server reported one.
 *
 * @param models - The models to list.
 * @returns A newline-separated string where each model is prefixed with `•`.
 */
export function formatModelList(models: readonly DiscoveredModel[]): string {
  return models
    .map((model) => {
      const label = model.name ?? simplifyModelId(model.id)
      return model.context ? `  • ${label} (${formatTokens(model.context)} ctx)` : `  • ${label}`
    })
    .join("\n")
}

/**
 * Renders a token count compactly the way the model's own documentation
 * usually quotes it: binary windows divide by 1024, so 131072 reads as `128k`,
 * and round decimal ones divide by 1000, so 200000 reads as `200k` rather
 * than `195k`.
 *
 * @param tokens - A positive token count.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  const divisor = tokens % 1024 === 0 ? 1024 : 1000
  return `${Math.round(tokens / divisor)}k`
}
