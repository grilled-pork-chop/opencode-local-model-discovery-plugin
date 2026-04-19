export class ModelCache {
  private store = new Map<string, { models: string[]; expiresAt: number }>()

  constructor(private ttl: number) {}

  get(url: string): string[] | null {
    const entry = this.store.get(url)
    if (!entry || Date.now() > entry.expiresAt) return null
    return entry.models
  }

  set(url: string, models: string[]): void {
    this.store.set(url, { models, expiresAt: Date.now() + this.ttl })
  }
}
