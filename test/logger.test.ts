import { describe, expect, test } from "bun:test"
import { errorMessage, formatModels, formatTokens } from "../opencode-local-model/logger"

describe("formatModels", () => {
  test("lists models on one line, with the context when known", () => {
    const models = [
      { id: "llama3", context: 131072 },
      { id: "/z-ai/glm-5.3" },
      { id: "q", name: "Qwen" },
    ]
    expect(formatModels(models)).toBe("llama3 (128k ctx), z-ai/glm-5.3, Qwen")
  })
})

describe("formatTokens", () => {
  test("uses binary or decimal thousands as documented by the model", () => {
    expect(formatTokens(512)).toBe("512")
    expect(formatTokens(131072)).toBe("128k")
    expect(formatTokens(200000)).toBe("200k")
  })
})

describe("errorMessage", () => {
  test("reads an Error's message and stringifies anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
    expect(errorMessage("plain")).toBe("plain")
  })
})
