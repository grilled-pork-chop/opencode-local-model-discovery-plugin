import { describe, it, expect } from "vitest"
import { mergeDiscoveredModels } from "../../src/discovery/injector.ts"

function makeConfig(existingModels: Record<string, unknown> = {}): any {
  return {
    provider: {
      local: { npm: "@ai-sdk/openai-compatible", models: existingModels },
    },
  }
}

describe("mergeDiscoveredModels", () => {
  it("injects new model IDs into the provider models map", () => {
    const config = makeConfig()
    mergeDiscoveredModels(config, "local", ["llama3", "mistral-7b"])
    expect(config.provider.local.models["llama3"]).toBeDefined()
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("injected entry has the correct shape", () => {
    const config = makeConfig()
    mergeDiscoveredModels(config, "local", ["llama3"])
    expect(config.provider.local.models["llama3"]).toEqual({ id: "llama3", name: "llama3" })
  })

  it("does not overwrite an existing model entry", () => {
    const config = makeConfig({ "llama3": { id: "llama3", name: "Custom Llama", modalities: {} } })
    mergeDiscoveredModels(config, "local", ["llama3", "mistral-7b"])
    expect(config.provider.local.models["llama3"].name).toBe("Custom Llama")
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("creates the models key when it is absent from the provider", () => {
    const config = { provider: { local: { npm: "@ai-sdk/openai-compatible" } } } as any
    mergeDiscoveredModels(config, "local", ["llama3"])
    expect(config.provider.local.models["llama3"]).toBeDefined()
  })

  it("leaves the models map unchanged when modelIds is empty", () => {
    const config = makeConfig({ "llama3": { id: "llama3", name: "Llama", modalities: {} } })
    mergeDiscoveredModels(config, "local", [])
    expect(Object.keys(config.provider.local.models)).toEqual(["llama3"])
  })
})
