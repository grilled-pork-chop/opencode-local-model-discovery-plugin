import type { ModelDraft, ModelEditorLike } from "../opencode-local-model/types"

/**
 * An in-memory stand-in for V2's ModelEditor with one available provider.
 * Like the real one, writes to any other provider are ignored.
 */
export function fakeEditor(providerID: string, initial: Record<string, Partial<ModelDraft>> = {}) {
  const models = new Map<string, ModelDraft>()
  for (const [id, model] of Object.entries(initial)) models.set(id, draft(id, model))
  let defaultModel: { providerID: string; modelID: string } | undefined

  const editor: ModelEditorLike = {
    list: (id) =>
      id === undefined || id === providerID ? [...models.keys()].map((m) => ({ id: m })) : [],
    update(id, modelID, update) {
      if (id !== providerID) return
      const current = models.get(modelID)
      const next = current ? structuredClone(current) : draft(modelID)
      update(next)
      models.set(modelID, next)
    },
    remove(id, modelID) {
      if (id === providerID) models.delete(modelID)
    },
    default: {
      get: () => defaultModel,
      set: (p, m) => {
        defaultModel = { providerID: p, modelID: m }
      },
    },
  }
  return { editor, models }
}

/** Mirrors V2's Model.Info.default: no settings, no variants, 200k/32k limits. */
function draft(id: string, overrides: Partial<ModelDraft> = {}): ModelDraft {
  return {
    modelID: id,
    name: id,
    limit: { context: 200_000, output: 32_000 },
    variants: [],
    ...overrides,
  }
}

/** A logger that records messages per level instead of printing them. */
export function fakeLogger() {
  const lines: { level: "info" | "warning" | "error"; message: string }[] = []
  return {
    lines,
    logger: {
      info: (message: string) => void lines.push({ level: "info", message }),
      warning: (message: string) => void lines.push({ level: "warning", message }),
      error: (message: string) => void lines.push({ level: "error", message }),
    },
  }
}
