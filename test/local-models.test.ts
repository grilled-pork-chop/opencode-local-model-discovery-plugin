import { describe, expect, test } from "bun:test"
import type { ProviderInfo } from "../opencode-local-model/types"
import {
  type LocalModel,
  changeToast,
  localModels,
  modelOptions,
} from "../opencode-local-model/ui/local-models"

const local: ProviderInfo = {
  id: "local",
  name: "Local",
  package: "@opencode/ai/providers/openai-compatible",
  settings: { baseURL: "http://127.0.0.1:18080/v1" },
}

/** A local model of the `local` provider. */
const model = (id: string, context?: number): LocalModel => ({
  providerID: "local",
  providerName: "Local",
  id,
  ...(context ? { context } : {}),
})

describe("localModels", () => {
  test("keeps only the models of discovered providers, with their context", () => {
    const catalog: ProviderInfo = { ...local, id: "302ai", integrationID: "302ai" }
    const listed = [
      { id: "llama3", providerID: "local", limit: { context: 131072 } },
      { id: "glm", providerID: "local", limit: { context: 0 } },
      { id: "gpt", providerID: "302ai", limit: { context: 128000 } },
    ]
    expect(localModels([local, catalog], listed)).toEqual([model("llama3", 131072), model("glm")])
  })

  test("falls back to the provider id when it has no name", () => {
    const listed = [{ id: "a", providerID: "local", limit: { context: 0 } }]
    const [first] = localModels([{ ...local, name: undefined }], listed)
    expect(first?.providerName).toBe("local")
  })
})

describe("changeToast", () => {
  test("says nothing when the list is unchanged", () => {
    expect(changeToast([model("a")], [model("a")])).toBeUndefined()
  })

  test("summarizes a provider's first models", () => {
    expect(changeToast([], [model("a"), model("b")])).toEqual({
      message: "2 model(s) available on Local",
      variant: "info",
    })
  })

  test("puts added and removed models in one toast, one line each", () => {
    expect(changeToast([model("a"), model("b")], [model("a"), model("c")])).toEqual({
      message: "c is now available on Local\nb was removed from Local",
      variant: "info",
    })
  })

  test("groups several changes per line", () => {
    expect(changeToast([model("a"), model("b")], [model("c"), model("d")])?.message).toBe(
      "2 new models on Local: c, d\n2 models removed from Local: a, b"
    )
  })

  test("is a warning when models were only removed", () => {
    expect(changeToast([model("a"), model("b")], [model("a")])).toEqual({
      message: "b was removed from Local",
      variant: "warning",
    })
  })
})

describe("modelOptions", () => {
  test("lists each model by id, grouped by provider, with only its context size", () => {
    expect(modelOptions([model("llama3", 131072), model("z-ai/glm-5.3")])).toEqual([
      {
        title: "llama3",
        value: { type: "model", providerID: "local", modelID: "llama3" },
        category: "Local",
        footer: "128k",
      },
      {
        title: "z-ai/glm-5.3",
        value: { type: "model", providerID: "local", modelID: "z-ai/glm-5.3" },
        category: "Local",
      },
      { title: "↻ Refresh now", value: { type: "refresh" } },
    ])
  })

  test("explains how to add a provider when there is no model", () => {
    const [empty, refresh] = modelOptions([])
    expect(empty).toMatchObject({ title: "No local model found", disabled: true })
    expect(refresh?.value).toEqual({ type: "refresh" })
  })
})
