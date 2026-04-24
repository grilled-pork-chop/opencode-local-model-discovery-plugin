import { discoverModels } from "../discover"
import type { ToastNotifier } from "../toast"

const PREFIX = "[opencode-local-model]"
const POLL_INTERVAL = 15_000

/**
 * Polls each registered provider URL on a fixed interval and fires toasts
 * for models that appear or disappear between cycles.
 */
export class ModelRefreshMonitor {
  private previousModels = new Map<string, string[]>()
  private intervals = new Map<string, ReturnType<typeof setInterval>>()

  /**
   * Seeds the initial model list for a URL so the first poll does not
   * re-toast models that were already present at startup.
   */
  seed(url: string, models: string[]): void {
    this.previousModels.set(url, models)
  }

  /** Begins periodic polling for model changes. No-op if already started for this URL. */
  start(providerKey: string, url: string, toast: ToastNotifier): void {
    if (this.intervals.has(url)) return
    const interval = setInterval(() => {
      this.poll(providerKey, url, toast).catch(() => {})
    }, POLL_INTERVAL)
    this.intervals.set(url, interval)
  }

  /** Stops all polling intervals and clears internal state. */
  cleanup(): void {
    for (const interval of this.intervals.values()) clearInterval(interval)
    this.intervals.clear()
    this.previousModels.clear()
  }

  private async poll(providerKey: string, url: string, toast: ToastNotifier): Promise<void> {
    try {
      const models = await discoverModels(url)
      const previous = this.previousModels.get(url)
      if (!previous) {
        this.previousModels.set(url, models)
        return
      }
      const added = models.filter((m) => !previous.includes(m))
      const removed = previous.filter((m) => !models.includes(m))
      for (const id of added) {
        console.info(`${PREFIX} New model "${id}" for provider "${providerKey}"`)
        await toast.info(`New model "${id}" discovered for provider "${providerKey}"`)
      }
      for (const id of removed) {
        console.info(`${PREFIX} Model "${id}" removed from provider "${providerKey}"`)
        await toast.warning(`Model "${id}" removed from provider "${providerKey}"`)
      }
      this.previousModels.set(url, models)
    } catch {
      // Silent — startup already toasted the error; skip this cycle
    }
  }
}
