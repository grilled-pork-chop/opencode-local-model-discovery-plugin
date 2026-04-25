import { describe, it, expect, beforeEach, vi } from "vitest"
import { normalizeBaseUrl, fetchModels } from "../../src/discovery/client.ts"

const mockFetch = vi.fn()
global.fetch = mockFetch

if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal)
}

function modelsResponse(ids: string[]) {
  return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) }
}

describe("normalizeBaseUrl", () => {
  it("strips trailing slash", () => {
    expect(normalizeBaseUrl("http://localhost:4000/")).toBe("http://localhost:4000")
  })

  it("strips /v1 suffix", () => {
    expect(normalizeBaseUrl("http://localhost:4000/v1")).toBe("http://localhost:4000")
  })

  it("strips both trailing slash and /v1", () => {
    expect(normalizeBaseUrl("http://localhost:4000/v1/")).toBe("http://localhost:4000")
  })

  it("leaves a clean URL unchanged", () => {
    expect(normalizeBaseUrl("http://localhost:4000")).toBe("http://localhost:4000")
  })
})

describe("fetchModels", () => {
  beforeEach(() => mockFetch.mockClear())

  it("returns model IDs from a valid response", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    await expect(fetchModels("http://localhost:11434")).resolves.toEqual(["llama3", "mistral-7b"])
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything())
  })

  it("throws on a non-OK HTTP response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    await expect(fetchModels("http://localhost:11434")).rejects.toThrow("HTTP 503")
  })

  it("throws when the response body has no data array", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })
    await expect(fetchModels("http://localhost:11434")).rejects.toThrow("missing data array")
  })

  it("filters out embedding models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "text-embedding-ada-002"]))
    await expect(fetchModels("http://localhost:11434")).resolves.toEqual(["llama3"])
  })

  it("filters out reranker models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "bge-reranker-base"]))
    await expect(fetchModels("http://localhost:11434")).resolves.toEqual(["llama3"])
  })

  it("returns an empty array when all models are filtered out", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["text-embedding-3-small", "bge-reranker-v2"]))
    await expect(fetchModels("http://localhost:11434")).resolves.toEqual([])
  })
})
