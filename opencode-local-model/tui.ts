/**
 * @module tui
 *
 * TUI half of the opencode-local-model plugin. OpenCode loads it from this
 * folder next to `index.ts`, in the terminal UI rather than the background
 * service, which is why toasts are available here.
 *
 * It shows one toast whenever local models are added or removed. It reads
 * the models from the TUI's own data, so it needs no channel to the server
 * plugin. Like `index.ts`, it only imports types from `@opencode/plugin`, so
 * the folder still works without `node_modules`.
 */

import type { Plugin } from "@opencode/plugin/tui"
import { PLUGIN_ID } from "./constants"
import { type LocalModel, changeToast, localModels } from "./ui/local-models"

type Context = Plugin.Context

/** Title of the change toast. */
const TITLE = "Local models"

/**
 * How long model updates are collected before comparing. A config reload
 * briefly empties the list, and one server poll can change several models;
 * waiting turns each of those bursts into one comparison and one toast.
 */
const SETTLE_MS = 500

async function setup(ctx: Context): Promise<Plugin.Cleanup> {
  let known = await loadLocalModels(ctx)
  let timer: ReturnType<typeof setTimeout> | undefined

  const stopListening = ctx.data.on("model.updated", () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const current = await loadLocalModels(ctx)
      const toast = changeToast(known, current)
      if (toast) ctx.ui.toast.show({ title: TITLE, ...toast })
      known = current
    }, SETTLE_MS)
  })

  return () => {
    clearTimeout(timer)
    stopListening()
  }
}

/**
 * Reads the current local models from the TUI's data, syncing it first.
 *
 * @param ctx - The TUI plugin context.
 * @returns The models of the providers this plugin discovers.
 */
async function loadLocalModels(ctx: Context): Promise<LocalModel[]> {
  const { provider, model } = ctx.data.location
  await Promise.all([provider.sync(), model.sync()])
  return localModels(provider.list() ?? [], model.list() ?? [])
}

const LocalModelTuiPlugin: Plugin.Definition = { id: `${PLUGIN_ID}.tui`, setup }

export default LocalModelTuiPlugin
