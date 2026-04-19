export class Toast {
  constructor(private client: any) {}

  async success(message: string): Promise<void> {
    await this.show(message, "success", 3000)
  }

  async error(message: string): Promise<void> {
    await this.show(message, "error", 5000)
  }

  private async show(message: string, variant: string, duration: number): Promise<void> {
    try {
      await this.client?.tui?.showToast({ body: { message, variant, duration } })
    } catch { /* non-critical */ }
  }
}
