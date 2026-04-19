export class ModelCache {
  private entry: { models: string[]; expiresAt: number } | null = null

  constructor(private ttl: number) {}

  get(): string[] | null {
    if (!this.entry || Date.now() > this.entry.expiresAt) return null
    return this.entry.models
  }

  set(models: string[]): void {
    this.entry = { models, expiresAt: Date.now() + this.ttl }
  }
}
