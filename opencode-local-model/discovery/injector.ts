import { UNKNOWN_CONTEXT, simplifyModelId } from "../constants"
import type { ModelDraft, ModelEditorLike } from "../types"
import type { DiscoveredModel } from "./client"
import { knownModelConfig } from "./known-models"

/**
 * Replaces a provider's models with the models returned by the API.
 * The API is treated as the sole source of truth, so models no longer
 * served by the provider are removed.
 *
 * Runs inside a `ctx.model.transform` callback, which OpenCode may replay
 * at any time: it must stay synchronous, deterministic and side-effect free.
 *
 * @param editor      - The model editor handed to the transform.
 * @param providerKey - The provider whose models are replaced.
 * @param models      - The models returned by {@link fetchModels} for this provider.
 */
export function applyDiscoveredModels(
  editor: ModelEditorLike,
  providerKey: string,
  models: readonly DiscoveredModel[]
): void {
  const served = new Set(models.map((model) => model.id))
  for (const { id } of editor.list(providerKey)) {
    if (!served.has(id)) editor.remove(providerKey, id)
  }
  for (const model of models) {
    editor.update(providerKey, model.id, (draft) => fillModel(draft, model))
  }
}

/**
 * Writes one discovered model into the draft OpenCode created for it.
 *
 * Limits come from the endpoint when the server publishes them, for example
 * vLLM's `max_model_len`. An unreported context falls back to
 * {@link UNKNOWN_CONTEXT}; an unreported output cap keeps OpenCode's default. The display name is the server's own
 * `name` when there is one, else the last path segment of the ID
 * (e.g. `"organization/llama3"` → `"llama3"`).
 *
 * @param draft - The model draft, pre-filled with OpenCode's defaults.
 * @param model - A model returned by {@link fetchModels}.
 */
function fillModel(draft: ModelDraft, model: DiscoveredModel): void {
  draft.modelID = model.id
  draft.name = model.name ?? simplifyModelId(model.id)
  draft.limit.context = model.context ?? UNKNOWN_CONTEXT
  if (model.output !== undefined) draft.limit.output = model.output

  const known = knownModelConfig(model.id)
  if (known?.settings) draft.settings = { ...draft.settings, ...known.settings }
  if (known?.variants) draft.variants = known.variants.map((variant) => ({ ...variant }))
}
