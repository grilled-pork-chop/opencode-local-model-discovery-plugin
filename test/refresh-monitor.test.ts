import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { DiscoveredModel } from "../opencode-local-model/discovery/client"
import { formatTokens, log } from "../opencode-local-model/logger"
import { ModelRefreshMonitor } from "../opencode-local-model/monitoring/refresh-monitor"

const local = { provider: { key: "local", baseUrl: "http://h" }, token: "t" }

let lines: { level: string; message: string }[] = []
const spies = (["info", "warning", "error"] as const).map((level) =>
  spyOn(log, level).mockImplementation((message: string) => {
    lines.push({ level, message })
  })
)

beforeEach(() => {
  lines = []
})
afterEach(() => {
  for (const spy of spies) spy.mockClear()
})

/** A monitor whose server answers with `served`, or throws `failure` when set. */
function setup() {
  const server = { served: [] as DiscoveredModel[], failure: undefined as Error | undefined }
  const fetches: { baseUrl: string; token?: string }[] = []
  let reloads = 0
  const monitor = new ModelRefreshMonitor(
    async () => {
      reloads++
    },
    async (baseUrl, token) => {
      fetches.push({ baseUrl, token })
      if (server.failure) throw server.failure
      return server.served.map((model) => ({ ...model }))
    }
  )
  return { server, monitor, fetches, reloads: () => reloads }
}

describe("ModelRefreshMonitor", () => {
  test("first discovery stores the list, logs it and reloads once", async () => {
    const t = setup()
    await t.monitor.track([local])
    t.server.served = [{ id: "a", context: 131072 }, { id: "org/b" }]
    await t.monitor.poll()
    expect(t.fetches).toEqual([{ baseUrl: "http://h", token: "t" }])
    expect(t.reloads()).toBe(1)
    expect(t.monitor.discovered()).toEqual(new Map([["local", t.server.served]]))
    expect(t.monitor.firstModel()).toEqual({ key: "local", id: "a" })
    expect(lines).toEqual([
      {
        level: "info",
        message: 'Discovered 2 model(s) for provider "local":\n  • a (128k ctx)\n  • b',
      },
    ])
  })

  test("an unchanged list does not reload", async () => {
    const t = setup()
    await t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.monitor.poll()
    await t.monitor.poll()
    expect(t.reloads()).toBe(1)
  })

  test("added and removed models reload once and are logged", async () => {
    const t = setup()
    await t.monitor.track([local])
    t.server.served = [{ id: "a" }, { id: "b" }]
    await t.monitor.poll()
    lines = []
    t.server.served = [{ id: "b" }, { id: "org/c" }]
    await t.monitor.poll()
    expect(t.reloads()).toBe(2)
    expect(lines).toEqual([
      { level: "info", message: 'New model "c" discovered for provider "local"' },
      { level: "warning", message: 'Model "a" removed from provider "local"' },
    ])
  })

  test("a failing server is logged once, keeps its last list, and recovers", async () => {
    const t = setup()
    await t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.monitor.poll()
    lines = []
    t.server.failure = new Error("HTTP 500")
    await t.monitor.poll()
    await t.monitor.poll()
    expect(t.monitor.discovered()).toEqual(new Map([["local", [{ id: "a" }]]]))
    expect(lines).toEqual([
      { level: "error", message: 'Model discovery failed for provider "local": HTTP 500' },
    ])
    t.server.failure = undefined
    await t.monitor.poll()
    expect(lines.at(-1)).toEqual({ level: "info", message: 'Provider "local" is reachable again' })
    expect(t.reloads()).toBe(1)
  })

  test("an empty list is a warning", async () => {
    const t = setup()
    await t.monitor.track([local])
    await t.monitor.poll()
    expect(lines).toEqual([{ level: "warning", message: 'No models found for provider "local"' }])
    expect(t.monitor.firstModel()).toBeUndefined()
  })

  test("track reports added and removed providers and keeps unchanged lists", async () => {
    const t = setup()
    expect(await t.monitor.track([local])).toEqual({ added: ["local"], removed: [] })
    t.server.served = [{ id: "a" }]
    await t.monitor.poll()
    expect(await t.monitor.track([local])).toEqual({ added: [], removed: [] })
    expect(t.monitor.discovered().size).toBe(1)
    expect(await t.monitor.track([])).toEqual({ added: [], removed: ["local"] })
  })

  test("dropping a discovered list reloads the registry", async () => {
    const t = setup()
    await t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.monitor.poll()
    expect(await t.monitor.track([{ ...local, token: "rotated" }])).toEqual({
      added: ["local"],
      removed: [],
    })
    expect(t.monitor.discovered().size).toBe(0)
    expect(t.reloads()).toBe(2)
  })

  test("poll can target only some providers", async () => {
    const t = setup()
    const lan = { provider: { key: "lan", baseUrl: "http://lan" } }
    await t.monitor.track([local, lan])
    await t.monitor.poll(["lan"])
    expect(t.fetches).toEqual([{ baseUrl: "http://lan", token: undefined }])
  })
})

describe("formatTokens", () => {
  test("uses binary or decimal thousands as documented by the model", () => {
    expect(formatTokens(512)).toBe("512")
    expect(formatTokens(131072)).toBe("128k")
    expect(formatTokens(200000)).toBe("200k")
  })
})
