import { describe, expect, test } from "bun:test"
import { extractCompatibleProviders } from "../opencode-local-model/discovery/scanner"

const provider = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  activation: "auto",
  package: "aisdk:@ai-sdk/openai-compatible",
  settings: { baseURL: "http://localhost:8080/v1/" },
  ...extra,
})

describe("extractCompatibleProviders", () => {
  test("reads a V1 provider migrated by OpenCode and normalizes its URL", () => {
    const { providers } = extractCompatibleProviders({ data: [provider("local")] })
    expect(providers).toEqual([{ key: "local", baseUrl: "http://localhost:8080" }])
  })

  test("accepts the native V2 package name and a bare array", () => {
    const listed = [provider("lan", { package: "@opencode/ai/providers/openai-compatible" })]
    expect(extractCompatibleProviders(listed).providers.map((p) => p.key)).toEqual(["lan"])
  })

  test("keeps a configured apiKey", () => {
    const listed = [provider("local", { settings: { baseURL: "http://h/v1", apiKey: "k" } })]
    expect(extractCompatibleProviders(listed).providers[0]).toEqual({
      key: "local",
      baseUrl: "http://h",
      apiKey: "k",
    })
  })

  test("leaves OpenCode's catalog providers alone, as a live V2 server lists them", () => {
    const listed = {
      data: [
        {
          id: "302ai",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: "https://api.302.ai/v1" },
          activation: "auto",
          integrationID: "302ai",
        },
        {
          id: "opencode",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { apiKey: "public", baseURL: "https://opencode.ai/zen/v1" },
          activation: "enabled",
          integrationID: "opencode",
        },
        {
          id: "local",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: "http://127.0.0.1:18080/v1", provider: "local" },
          activation: "enabled",
        },
      ],
    }
    expect(extractCompatibleProviders(listed)).toEqual({
      providers: [{ key: "local", baseUrl: "http://127.0.0.1:18080" }],
      skipped: [],
    })
  })

  test("ignores other packages and providers without a baseURL", () => {
    const listed = [
      provider("anthropic", { package: "@opencode/ai/providers/anthropic" }),
      provider("nourl", { settings: {} }),
      provider("nosettings", { settings: undefined }),
    ]
    expect(extractCompatibleProviders(listed)).toEqual({ providers: [], skipped: [] })
  })

  test("leaves OpenCode's built-in discovery providers alone", () => {
    const listed = [provider("ollama"), provider("lmstudio"), provider("vllm"), provider("local")]
    const result = extractCompatibleProviders(listed)
    expect(result.providers.map((p) => p.key)).toEqual(["local"])
    expect(result.skipped).toEqual(["ollama", "lmstudio", "vllm"])
  })

  test("never throws on malformed input", () => {
    for (const listed of [undefined, null, 42, "x", {}, { data: "x" }, [null, 1, "a"]]) {
      expect(extractCompatibleProviders(listed)).toEqual({ providers: [], skipped: [] })
    }
  })
})
