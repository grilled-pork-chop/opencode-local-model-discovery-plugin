import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { LocalModelPlugin } from "../src/index.ts"

const mockFetch = vi.fn()
global.fetch = mockFetch

if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal)
}

const TEMPLATE_PATH = join(import.meta.dirname, "../opencode.json.example")

function makeInput(client: unknown) {
  return {
    client,
    project: { id: "test", name: "test", path: "/tmp", worktree: "", time: { created: Date.now() } },
    directory: "/tmp",
    worktree: "",
    $: vi.fn(),
    config: {},
  } as any
}

describe("opencode.json.example template", () => {
  let template: any

  beforeEach(() => {
    mockFetch.mockClear()
    template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8"))
  })

  it("is valid JSON with the expected shape", () => {
    expect(template).toMatchObject({
      $schema: expect.any(String),
      plugin: expect.any(Array),
    })
  })

  it("declares exactly one plugin entry", () => {
    expect(template.plugin).toHaveLength(1)
  })

  it("plugin entry references opencode-local-model", () => {
    const [name] = template.plugin[0]
    expect(name).toBe("opencode-local-model")
  })

  it("plugin options include a valid url string", () => {
    const [, opts] = template.plugin[0]
    expect(typeof opts.url).toBe("string")
    expect(opts.url).toMatch(/^https?:\/\//)
  })

  it("plugin options include a positive numeric ttl", () => {
    const [, opts] = template.plugin[0]
    expect(typeof opts.ttl).toBe("number")
    expect(opts.ttl).toBeGreaterThan(0)
  })

  it("template options boot the plugin and discover models end-to-end", async () => {
    const [, opts] = template.plugin[0]

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "llama3:8b" }, { id: "mistral:7b" }] }),
    })

    const client = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
    const hooks = await LocalModelPlugin(makeInput(client), opts)
    const config: any = {}
    await hooks.config!(config)

    expect(config.provider.local.npm).toBe("@ai-sdk/openai-compatible")
    expect(config.provider.local.models["llama3:8b"]).toBeDefined()
    expect(config.provider.local.models["mistral:7b"]).toBeDefined()
    expect(client.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "success" }) })
    )
  })
})
