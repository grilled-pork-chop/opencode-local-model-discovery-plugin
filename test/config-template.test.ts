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
      provider: expect.any(Object),
      plugin: expect.any(Array),
    })
  })

  it("has at least one @ai-sdk/openai-compatible provider with a baseURL", () => {
    const entries = Object.values(template.provider) as any[]
    const compatible = entries.filter(
      (p) => p.npm === "@ai-sdk/openai-compatible" && typeof p.options?.baseURL === "string"
    )
    expect(compatible.length).toBeGreaterThan(0)
  })

  it("declares exactly one plugin entry", () => {
    expect(template.plugin).toHaveLength(1)
  })

  it("plugin entry is opencode-local-model with no options", () => {
    const [name, opts] = template.plugin[0]
    expect(name).toBe("opencode-local-model")
    expect(opts == null || Object.keys(opts).length === 0).toBe(true)
  })

  it("template config boots the plugin and injects models end-to-end", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "llama3:8b" }, { id: "mistral:7b" }] }),
    })
    const client = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
    const hooks = await LocalModelPlugin(makeInput(client))
    const config = JSON.parse(JSON.stringify(template))
    await hooks.config(config)

    const allModels = Object.values(config.provider).flatMap((p: any) => Object.keys(p.models ?? {}))
    expect(allModels).toContain("llama3:8b")
    expect(allModels).toContain("mistral:7b")
    expect(client.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "success" }) })
    )
  })
})
