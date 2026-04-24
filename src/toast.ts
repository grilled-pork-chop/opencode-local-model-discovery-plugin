export class ToastNotifier {
  constructor(private client: unknown) {}

  async success(message: string): Promise<void> {
    await this.show(message, "success", 3000)
  }

  async error(message: string): Promise<void> {
    await this.show(message, "error", 5000)
  }

  async warning(message: string): Promise<void> {
    await this.show(message, "warning", 4000)
  }

  async info(message: string): Promise<void> {
    await this.show(message, "info", 3000)
  }

  private async show(message: string, variant: string, duration: number): Promise<void> {
    try {
      const tui = (this.client as Record<string, unknown> | null | undefined)?.["tui"] as
        | Record<string, unknown>
        | undefined
      const showToast = tui?.["showToast"]
      if (typeof showToast === "function") {
        await showToast.call(tui, { body: { message, variant, duration } })
      }
    } catch {
      // non-critical
    }
  }
}
