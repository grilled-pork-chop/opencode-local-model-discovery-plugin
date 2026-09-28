import { describe, expect, test } from "bun:test"
import type { ProviderInfo } from "../opencode-local-model/types"
import { type LocalModel, changeToast, localModels } from "../opencode-local-model/ui/local-models"

const local: ProviderInfo = {
  id: "local",
  name: "Local",
  package: "@opencode/ai/providers/openai-compatible",
  settings: { baseURL: "http://127.0.0.1:18080/v1" },
}

/** A local model of the `local` provider. */
const model = (id: string): LocalModel => ({ providerID: "local", providerName: "Local", id })

describe("localModels", () => {
  test("keeps only the models of discovered providers", () => {
    const catalog: ProviderInfo = { ...local, id: "302ai", integrationID: "302ai" }
    const listed = [
      { id: "llama3", providerID: "local" },
      { id: "glm", providerID: "local" },
      { id: "gpt", providerID: "302ai" },
    ]
    expect(localModels([local, catalog], listed)).toEqual([model("llama3"), model("glm")])
  })

  test("falls back to the provider id when it has no name", () => {
    const listed = [{ id: "a", providerID: "local" }]
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
