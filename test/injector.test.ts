import { describe, expect, test } from "bun:test"
import { applyDiscoveredModels } from "../opencode-local-model/discovery/injector"
import { fakeEditor } from "./fakes"

describe("applyDiscoveredModels", () => {
  test("writes the name and context; the output cap keeps OpenCode's default", () => {
    const { editor, models } = fakeEditor("local")
    applyDiscoveredModels(editor, "local", [
      { id: "org/llama3", context: 131072 },
      { id: "qwen", name: "Qwen 3" },
    ])
    expect(models.get("org/llama3")).toMatchObject({
      modelID: "org/llama3",
      name: "org/llama3",
      limit: { context: 131072, output: 32_000 },
    })
    expect(models.get("qwen")).toMatchObject({
      name: "Qwen 3",
      limit: { context: 0, output: 32_000 },
    })
  })

  test("removes models the server no longer reports", () => {
    const { editor, models } = fakeEditor("local", { stale: {}, kept: {} })
    applyDiscoveredModels(editor, "local", [{ id: "kept" }, { id: "new" }])
    expect([...models.keys()].sort()).toEqual(["kept", "new"])
  })

  test("applies known-model reasoning settings and variants in V2 shape", () => {
    const { editor, models } = fakeEditor("local")
    applyDiscoveredModels(editor, "local", [{ id: "z-ai/GLM-5.3-flash" }, { id: "glm-4.6" }])
    expect(models.get("z-ai/GLM-5.3-flash")).toMatchObject({
      settings: { reasoningEffort: "max" },
      variants: [
        { id: "low", settings: { reasoningEffort: "low" } },
        { id: "high", settings: { reasoningEffort: "high" } },
        { id: "max", settings: { reasoningEffort: "max" } },
      ],
    })
    expect(models.get("glm-4.6")?.variants).toEqual([])
    expect(models.get("glm-4.6")?.settings).toBeUndefined()
  })

  test("is replay safe: running the transform twice gives the same result", () => {
    const { editor, models } = fakeEditor("local", { old: {} })
    const discovered = [{ id: "a", context: 4096 }, { id: "glm-5.3" }]
    applyDiscoveredModels(editor, "local", discovered)
    const first = structuredClone([...models])
    applyDiscoveredModels(editor, "local", discovered)
    expect([...models]).toEqual(first)
  })

  test("does nothing for a provider OpenCode does not know", () => {
    const { editor, models } = fakeEditor("local", { a: {} })
    applyDiscoveredModels(editor, "other", [{ id: "b" }])
    expect([...models.keys()]).toEqual(["a"])
  })
})
