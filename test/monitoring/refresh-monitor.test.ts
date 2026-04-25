import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ModelRefreshMonitor } from "../../src/monitoring/refresh-monitor.ts"
import { Notifier } from "../../src/notification/notifier.ts"

const mockFetch = vi.fn()
global.fetch = mockFetch

if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal)
}

function modelsResponse(ids: string[]) {
  return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) }
}

describe("ModelRefreshMonitor", () => {
  let mockClient: { tui: { showToast: ReturnType<typeof vi.fn> } }
  let notifier: Notifier
  let monitor: ModelRefreshMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockClear()
    mockClient = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
    notifier = new Notifier(mockClient)
    monitor = new ModelRefreshMonitor()
  })

  afterEach(() => {
    monitor.cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("shows no toast on first poll when seeded with the same models", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  it('fires an info toast "New model X discovered for provider Y" when a model appears', async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variant: "info",
          message: expect.stringContaining('"mistral-7b"'),
        }),
      })
    )
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ message: expect.stringContaining('"local"') }),
      })
    )
  })

  it('fires a warning toast "Model X removed from provider Y" when a model disappears', async () => {
    monitor.seed("http://localhost:11434", ["llama3", "mistral-7b"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variant: "warning",
          message: expect.stringContaining('"mistral-7b"'),
        }),
      })
    )
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ message: expect.stringContaining('"local"') }),
      })
    )
  })

  it("fires no toast when the model list is unchanged", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  it("is silent on fetch errors during polling", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockRejectedValue(new Error("network error"))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  it("start is idempotent — a second call for the same URL does not create a duplicate interval", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    monitor.start("local", "http://localhost:11434", notifier)
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("cleanup stops all polling", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    monitor.start("local", "http://localhost:11434", notifier)
    monitor.cleanup()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("tracks each provider URL independently", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    monitor.seed("http://localhost:1234",  ["qwen2"])
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3", "phi-4"]))
      .mockResolvedValueOnce(modelsResponse(["qwen2"]))
    monitor.start("local1", "http://localhost:11434", notifier)
    monitor.start("local2", "http://localhost:1234",  notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockClient.tui.showToast).toHaveBeenCalledTimes(1)
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "info", message: expect.stringContaining('"phi-4"') }),
      })
    )
  })

  it("accumulates model changes across multiple poll cycles", async () => {
    monitor.seed("http://localhost:11434", ["llama3"])
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3", "mistral-7b"]))
      .mockResolvedValueOnce(modelsResponse(["mistral-7b", "phi-4"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    mockClient.tui.showToast.mockClear()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "warning", message: expect.stringContaining('"llama3"') }),
      })
    )
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "info", message: expect.stringContaining('"phi-4"') }),
      })
    )
  })

  it("stores an unseeded first-poll result without toasting, then diffs from the second poll", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["llama3", "mistral-7b"]))
    monitor.start("local", "http://localhost:11434", notifier)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "info", message: expect.stringContaining('"mistral-7b"') }),
      })
    )
  })
})
