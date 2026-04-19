/** Display duration in milliseconds for each notification severity level. */
const DURATION = {
  success: 3_000,
  info:    3_000,
  warning: 4_000,
  error:   5_000,
} as const

type ToastVariant = keyof typeof DURATION

/**
 * Sends user-facing notification toasts via the OpenCode TUI client.
 *
 * All methods are fire-and-forget-safe: errors thrown by the underlying
 * client call are swallowed silently so that a broken notification path
 * never disrupts the config hook or background monitor.
 */
export class Notifier {
  /**
   * @param client - The OpenCode client object supplied by {@link PluginInput}.
   *                 Typed as `any` because OpenCode does not export its client type.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly client: any) {}

  /**
   * Shows a success toast.
   * @param message - Human-readable notification body.
   */
  async success(message: string): Promise<void> {
    await this.show("success", message)
  }

  /**
   * Shows an error toast.
   * @param message - Human-readable notification body.
   */
  async error(message: string): Promise<void> {
    await this.show("error", message)
  }

  /**
   * Shows a warning toast.
   * @param message - Human-readable notification body.
   */
  async warning(message: string): Promise<void> {
    await this.show("warning", message)
  }

  /**
   * Shows an informational toast.
   * @param message - Human-readable notification body.
   */
  async info(message: string): Promise<void> {
    await this.show("info", message)
  }

  /**
   * Dispatches a toast via `client.tui.showToast`.
   * @param variant - The visual severity level.
   * @param message - Human-readable notification body.
   */
  private async show(variant: ToastVariant, message: string): Promise<void> {
    try {
      await this.client?.tui?.showToast?.({
        body: { message, variant, duration: DURATION[variant] },
      })
    } catch {
      // Non-critical — notification failures must not affect plugin behavior
    }
  }
}
