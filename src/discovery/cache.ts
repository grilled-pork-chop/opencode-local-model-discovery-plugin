import { CACHE_TTL_MS } from "../constants"

/**
 * In-memory TTL cache for a single provider's discovered model IDs.
 *
 * A `null` return from {@link get} means the cache is empty or expired;
 * callers should fetch fresh data and call {@link set} to repopulate it.
 */
export class DiscoveryCache {
  private entry: { models: string[]; expiresAt: number } | null = null

  /**
   * @param ttlMs - How long (in milliseconds) a cached entry remains valid.
   *                Defaults to {@link CACHE_TTL_MS}. Pass a negative value to
   *                disable caching (every call to {@link get} returns `null`).
   */
  constructor(private readonly ttlMs: number = CACHE_TTL_MS) {}

  /**
   * Returns the cached model list if it exists and has not expired.
   * @returns The cached model IDs, or `null` if the cache is cold or stale.
   */
  get(): string[] | null {
    if (!this.entry || Date.now() > this.entry.expiresAt) return null
    return this.entry.models
  }

  /**
   * Stores a new model list and resets the expiry clock.
   * @param models - The model IDs returned by the provider.
   */
  set(models: string[]): void {
    this.entry = { models, expiresAt: Date.now() + this.ttlMs }
  }
}
