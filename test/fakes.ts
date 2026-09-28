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

/** Mirrors V2's Model.Info.default: no settings, no variants, a 200k context. */
function draft(id: string, overrides: Partial<ModelDraft> = {}): ModelDraft {
  return {
    modelID: id,
    name: id,
    limit: { context: 200_000 },
    variants: [],
    ...overrides,
  }
}
