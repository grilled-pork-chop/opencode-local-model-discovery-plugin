/**
 * @module tui
 *
 * TUI half of the opencode-local-model plugin. OpenCode loads it from this
 * folder next to `index.ts`, in the terminal UI rather than the background
 * service, which is why toasts and dialogs are available here.
 *
 * ### What it adds
 * - A toast when local models are added or removed, grouped per provider.
 * - A `/local-models` command (also in the command palette) listing the
 *   discovered models; picking one switches the current session to it, and
 *   "Refresh now" makes the server plugin fetch the models again.
 *
 * It reads models from the TUI's own data, so it needs no channel to the
 * server plugin. Like `index.ts`, it only imports types from
 * `@opencode/plugin`, so the folder still works without `node_modules`.
 */

import type { Plugin } from "@opencode/plugin/tui"
import { PLUGIN_ID } from "./constants"
import {
  type LocalModel,
  type LocalModelChoice,
  changeToast,
  localModels,
  modelOptions,
} from "./ui/local-models"

type Context = Plugin.Context

/** Title of every toast and of the dialog. */
const TITLE = "Local models"

/**
 * How long model updates are collected before comparing. A refresh or a
 * config reload briefly empties the list, and one server poll can change
 * several models; waiting turns each of those bursts into one comparison.
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

  // Commands are registered from a slot render, the way OpenCode's own TUI
  // plugins do; the slot itself renders nothing.
  const removeSlot = ctx.ui.slot({
    append: "app",
    render: () => {
      ctx.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: `${PLUGIN_ID}.open`,
            title: TITLE,
            description: "List the models discovered on your local providers",
            group: TITLE,
            palette: true,
            slash: { name: "local-models" },
            run: () => openLocalModels(ctx),
          },
        ],
      }))
      return null
    },
  })

  return () => {
    clearTimeout(timer)
    stopListening()
    removeSlot()
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

/**
 * Opens the `/local-models` dialog and acts on the choice.
 *
 * @param ctx - The TUI plugin context.
 */
async function openLocalModels(ctx: Context): Promise<void> {
  const options = modelOptions(await loadLocalModels(ctx))
  const selected = ctx.ui.model.current()
  const current = options.find(
    ({ value }) =>
      value.type === "model" &&
      value.providerID === selected?.providerID &&
      value.modelID === selected?.modelID
  )?.value

  const choice = await ctx.ui.dialog.select<LocalModelChoice>({
    title: TITLE,
    placeholder: "Search models",
    options,
    current,
  })
  // Reloading the project's config and plugins makes the discovery plugin fetch
  // every provider's models again; any change then gets the usual toast.
  if (choice?.type === "refresh") await ctx.client.location.reload()
  if (choice?.type === "model") await switchModel(ctx, choice.providerID, choice.modelID)
}

/**
 * Switches the open session to a model. Outside a session there is nothing
 * to switch, so the user is told to open one first.
 *
 * @param ctx        - The TUI plugin context.
 * @param providerID - The model's provider.
 * @param modelID    - The model to use.
 */
async function switchModel(ctx: Context, providerID: string, modelID: string): Promise<void> {
  const route = ctx.ui.router.current()
  if (route.type !== "session") {
    ctx.ui.toast.show({
      title: TITLE,
      message: `Open a session to switch to ${modelID}`,
      variant: "warning",
    })
    return
  }
  await ctx.client.session.switchModel({
    sessionID: route.sessionID,
    model: { providerID, id: modelID },
  })
}

const LocalModelTuiPlugin: Plugin.Definition = { id: `${PLUGIN_ID}.tui`, setup }

export default LocalModelTuiPlugin
