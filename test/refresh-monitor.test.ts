import { beforeEach, describe, expect, test } from "bun:test"
import type { DiscoveredModel } from "../opencode-local-model/discovery/client"
import {
  ModelRefreshMonitor,
  clearSharedDiscovery,
  formatTokens,
} from "../opencode-local-model/monitoring/refresh-monitor"
import { fakeLogger } from "./fakes"

const local = {
  provider: { key: "local", baseUrl: "http://h" },
  token: "t",
}

/** A monitor whose server answers with `served`, or throws `failure` when set. */
function setup() {
  const server = { served: [] as DiscoveredModel[], failure: undefined as Error | undefined }
  const { logger, lines } = fakeLogger()
  let reloads = 0
  const fetches: { baseUrl: string; token?: string }[] = []
  const monitor = new ModelRefreshMonitor(
    async () => {
      reloads++
    },
    logger,
    async (baseUrl, token) => {
      fetches.push({ baseUrl, token })
      if (server.failure) throw server.failure
      return server.served.map((model) => ({ ...model }))
    }
  )
  // Every refresh in these tests must reach the fake server.
  const refresh = () => {
    clearSharedDiscovery()
    return monitor.refreshAll()
  }
  return { server, monitor, lines, fetches, refresh, reloads: () => reloads }
}

beforeEach(() => clearSharedDiscovery())

describe("ModelRefreshMonitor", () => {
  test("first discovery stores the list, logs it and reloads once", async () => {
    const t = setup()
    t.monitor.track([local])
    t.server.served = [{ id: "a", context: 131072 }, { id: "org/b" }]
    expect(await t.refresh()).toBe(true)
    expect(t.fetches).toEqual([{ baseUrl: "http://h", token: "t" }])
    expect(t.reloads()).toBe(1)
    expect(t.monitor.discovered()).toEqual([["local", t.server.served]])
    expect(t.monitor.firstModel()).toEqual({ providerID: "local", modelID: "a" })
    expect(t.lines).toEqual([
      {
        level: "info",
        message: 'Discovered 2 model(s) for provider "local":\n  • a (128k ctx)\n  • b',
      },
    ])
  })

  test("an unchanged list does not reload", async () => {
    const t = setup()
    t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.refresh()
    expect(await t.refresh()).toBe(false)
    expect(t.reloads()).toBe(1)
  })

  test("added and removed models reload once and are logged", async () => {
    const t = setup()
    t.monitor.track([local])
    t.server.served = [{ id: "a" }, { id: "b" }]
    await t.refresh()
    t.lines.length = 0
    t.server.served = [{ id: "b" }, { id: "org/c" }]
    expect(await t.refresh()).toBe(true)
    expect(t.reloads()).toBe(2)
    expect(t.lines).toEqual([
      { level: "info", message: 'New model "c" discovered for provider "local"' },
      { level: "warning", message: 'Model "a" removed from provider "local"' },
    ])
  })

  test("a failing server is logged once, keeps its last list, and recovers", async () => {
    const t = setup()
    t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.refresh()
    t.lines.length = 0
    t.server.failure = new Error("HTTP 500")
    expect(await t.refresh()).toBe(false)
    expect(await t.refresh()).toBe(false)
    expect(t.monitor.discovered()).toEqual([["local", [{ id: "a" }]]])
    expect(t.lines).toEqual([
      { level: "error", message: 'Model discovery failed for provider "local": HTTP 500' },
    ])
    t.server.failure = undefined
    expect(await t.refresh()).toBe(false)
    expect(t.lines.at(-1)).toEqual({
      level: "info",
      message: 'Provider "local" is reachable again',
    })
    expect(t.reloads()).toBe(1)
  })

  test("an empty list is a warning", async () => {
    const t = setup()
    t.monitor.track([local])
    await t.refresh()
    expect(t.lines).toEqual([{ level: "warning", message: 'No models found for provider "local"' }])
    expect(t.monitor.firstModel()).toBeUndefined()
  })

  test("track keeps lists for unchanged providers and reports dropped ones", async () => {
    const t = setup()
    t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await t.refresh()
    expect(t.monitor.track([local])).toEqual({ changed: false, dropped: false })
    expect(t.monitor.discovered()).toHaveLength(1)
    expect(t.monitor.track([{ ...local, token: "rotated" }])).toEqual({
      changed: true,
      dropped: true,
    })
    expect(t.monitor.discovered()).toEqual([])
    expect(t.monitor.track([])).toEqual({ changed: true, dropped: false })
    expect(t.monitor.track([])).toEqual({ changed: false, dropped: false })
    expect(t.monitor.keys()).toEqual([])
  })

  test("refreshes requested during a run share one follow-up run", async () => {
    const t = setup()
    t.monitor.track([local])
    const first = t.monitor.refreshAll()
    const second = t.monitor.refreshAll()
    expect(t.monitor.refreshAll()).toBe(second)
    await Promise.all([first, second])
    // The follow-up reuses the answer the first run just got.
    expect(t.fetches).toHaveLength(1)
  })

  test("a provider tracked during a run is fetched by the follow-up run", async () => {
    const t = setup()
    const first = t.monitor.refreshAll()
    t.monitor.track([local])
    t.server.served = [{ id: "a" }]
    await Promise.all([first, t.monitor.refreshAll()])
    expect(t.fetches).toHaveLength(1)
    expect(t.monitor.discovered()).toEqual([["local", [{ id: "a" }]]])
  })

  test("instances polling the same server share a recent answer", async () => {
    const a = setup()
    const b = setup()
    a.monitor.track([local])
    b.monitor.track([local])
    await a.monitor.refreshAll()
    await b.monitor.refreshAll()
    expect(a.fetches.length + b.fetches.length).toBe(1)
  })
})

describe("formatTokens", () => {
  test("uses binary or decimal thousands as documented by the model", () => {
    expect(formatTokens(512)).toBe("512")
    expect(formatTokens(131072)).toBe("128k")
    expect(formatTokens(200000)).toBe("200k")
  })
})
