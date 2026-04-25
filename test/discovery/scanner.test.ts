import { describe, it, expect } from "vitest"
import { extractCompatibleProviders } from "../../src/discovery/scanner.ts"

describe("extractCompatibleProviders", () => {
  it("returns empty array for null config", () => {
    expect(extractCompatibleProviders(null)).toEqual([])
  })

  it("returns empty array for a non-object config", () => {
    expect(extractCompatibleProviders("string")).toEqual([])
    expect(extractCompatibleProviders(42)).toEqual([])
  })

  it("returns empty array when config has no provider key", () => {
    expect(extractCompatibleProviders({})).toEqual([])
  })

  it("skips a provider that has no npm field", () => {
    const config = { provider: { local: { options: { baseURL: "http://localhost:11434/v1" } } } }
    expect(extractCompatibleProviders(config)).toEqual([])
  })

  it("skips a provider with a non-matching npm value", () => {
    const config = { provider: { local: { npm: "@ai-sdk/openai", options: { baseURL: "http://localhost:11434/v1" } } } }
    expect(extractCompatibleProviders(config)).toEqual([])
  })

  it("skips a provider without options.baseURL", () => {
    const config = { provider: { local: { npm: "@ai-sdk/openai-compatible" } } }
    expect(extractCompatibleProviders(config)).toEqual([])
  })

  it("skips a provider with a non-string baseURL", () => {
    const config = { provider: { local: { npm: "@ai-sdk/openai-compatible", options: { baseURL: 1234 } } } }
    expect(extractCompatibleProviders(config)).toEqual([])
  })

  it("returns a ProviderEntry with a normalized baseUrl", () => {
    const config = {
      provider: {
        local: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:11434/v1" } },
      },
    }
    expect(extractCompatibleProviders(config)).toEqual([
      { key: "local", baseUrl: "http://localhost:11434" },
    ])
  })

  it("returns one entry per compatible provider", () => {
    const config = {
      provider: {
        ollama:  { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:11434/v1" } },
        lmstudio: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:1234/v1" } },
        other:   { npm: "@ai-sdk/anthropic", options: { apiKey: "sk-..." } },
      },
    }
    const result = extractCompatibleProviders(config)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ key: "ollama",   baseUrl: "http://localhost:11434" })
    expect(result).toContainEqual({ key: "lmstudio", baseUrl: "http://localhost:1234"  })
  })
})
