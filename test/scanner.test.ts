import { describe, expect, test } from "bun:test"
import { extractCompatibleProviders } from "../opencode-local-model/discovery/scanner"
import type { ProviderInfo } from "../opencode-local-model/types"

/** A provider as a live OpenCode V2 server lists a V1 config entry. */
const provider = (id: string, extra: Partial<ProviderInfo> = {}): ProviderInfo => ({
  id,
  package: "@opencode/ai/providers/openai-compatible",
  settings: { baseURL: "http://localhost:8080/v1/", provider: id },
  ...extra,
})

describe("extractCompatibleProviders", () => {
  test("reads a config provider and normalizes its URL", () => {
    expect(extractCompatibleProviders([provider("local")])).toEqual([
      { key: "local", baseUrl: "http://localhost:8080" },
    ])
  })

  test("accepts the package name V2 gives an unmigrated V1 provider", () => {
    const listed = [provider("lan", { package: "aisdk:@ai-sdk/openai-compatible" })]
    expect(extractCompatibleProviders(listed).map((p) => p.key)).toEqual(["lan"])
  })

  test("keeps a configured apiKey", () => {
    const listed = [provider("local", { settings: { baseURL: "http://h/v1", apiKey: "k" } })]
    expect(extractCompatibleProviders(listed)).toEqual([
      { key: "local", baseUrl: "http://h", apiKey: "k" },
    ])
  })

  test("skips other packages and providers without a baseURL", () => {
    const listed = [
      provider("anthropic", { package: "@opencode/ai/providers/anthropic" }),
      provider("nourl", { settings: {} }),
      provider("nosettings", { settings: undefined }),
    ]
    expect(extractCompatibleProviders(listed)).toEqual([])
  })

  test("skips OpenCode's own providers, which carry an integrationID", () => {
    const listed = [
      provider("302ai", { integrationID: "302ai" }),
      provider("opencode", { integrationID: "opencode" }),
    ]
    expect(extractCompatibleProviders(listed)).toEqual([])
  })

  test("leaves OpenCode's built-in discovery providers alone", () => {
    const listed = [provider("ollama"), provider("lmstudio"), provider("vllm"), provider("local")]
    expect(extractCompatibleProviders(listed).map((p) => p.key)).toEqual(["local"])
  })
})
