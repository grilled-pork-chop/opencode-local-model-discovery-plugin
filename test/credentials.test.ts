import { describe, expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { resolveToken } from "../opencode-local-model/auth/credentials"

type Integration = Plugin.Context["integration"]

/** An integration whose active connection resolves to `credential`. */
function integration(credential: unknown, active: unknown = { type: "credential" }) {
  return {
    connection: {
      active: async () => active,
      resolve: async () => credential,
    },
  } as unknown as Integration
}

const local = { key: "local", baseUrl: "http://h" }

describe("resolveToken", () => {
  test("a configured apiKey wins over a stored credential", async () => {
    const stored = integration({ type: "key", key: "stored" })
    expect(await resolveToken(stored, { ...local, apiKey: "configured" })).toBe("configured")
  })

  test("uses a stored API key", async () => {
    expect(await resolveToken(integration({ type: "key", key: "k" }), local)).toBe("k")
  })

  test("uses a stored OAuth access token", async () => {
    const oauth = { type: "oauth", access: "a", refresh: "r", expires: 0 }
    expect(await resolveToken(integration(oauth), local)).toBe("a")
  })

  test("has no token without an active connection", async () => {
    expect(await resolveToken(integration(undefined, undefined), local)).toBeUndefined()
  })

  test("a failing lookup degrades to no token", async () => {
    const failing = {
      connection: {
        active: async () => {
          throw new Error("store unavailable")
        },
      },
    } as unknown as Integration
    expect(await resolveToken(failing, local)).toBeUndefined()
  })
})
