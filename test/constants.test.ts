import { describe, expect, test } from "bun:test"
import { sanitizeModelId } from "../opencode-local-model/constants"

describe("sanitizeModelId", () => {
  test("keeps the whole id", () => {
    expect(sanitizeModelId("z-ai/glm-5.3")).toBe("z-ai/glm-5.3")
  })

  test("trims whitespace and stray slashes", () => {
    expect(sanitizeModelId("  /organization//llama3/ ")).toBe("organization/llama3")
  })
})
