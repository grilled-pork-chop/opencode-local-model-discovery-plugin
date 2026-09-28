# opencode-local-model-discovery-plugin

An [OpenCode](https://opencode.ai) V2 plugin that **auto-discovers models** from
any OpenAI-compatible provider you already have configured, with no need to
hand-maintain a `models` list. Point it at a local server (llama.cpp, LocalAI,
LiteLLM, a vLLM or LM Studio behind a custom name, …) and every model the server
exposes shows up in OpenCode, **kept in sync while you work**: a model you pull
appears in the model picker, and one you delete disappears, without restarting
OpenCode.

> Requires OpenCode **2.0.10 or later**. For OpenCode V1, use the
> [`v0.1.0-opencode-v1`](../../tree/v0.1.0-opencode-v1) tag.

## How it works

The plugin looks at the providers declared in your OpenCode config that use the
OpenAI-compatible adapter with a `baseURL`, then:

1. **Discover**: fetches `GET {baseURL}/v1/models`, authenticated when the
   provider has a credential, reading each model's reported limits along the way.
2. **Inject**: replaces the provider's models with what the server reports (the
   API is the source of truth, so removed models drop out too).
3. **Refresh**: re-checks every 15 seconds in the background. When the list
   changes, OpenCode's model registry is reloaded, so the change shows up
   immediately. Editing the config (adding a provider, changing a `baseURL`) is
   picked up the same way.

Only providers you declared yourself are touched. OpenCode's own catalog
providers (`opencode`, `github-copilot`, the models.dev catalog) keep their
curated model lists, and providers named `ollama`, `lmstudio` or `vllm` are left
to OpenCode V2's built-in discovery for those servers.

## Install

Copy the `opencode-local-model` folder into your OpenCode plugins directory:

```bash
git clone https://github.com/grilled-pork-chop/opencode-local-model-discovery-plugin /tmp/olmd
cp -r /tmp/olmd/opencode-local-model ~/.config/opencode/plugins/
```

OpenCode loads the folder through its `index.ts`; nothing needs to be installed.
Coming from V1? Delete the old `opencode-local.ts` from your plugin directory, or
OpenCode would load it as a second plugin.

Then declare an OpenAI-compatible provider in your `opencode.jsonc`. The plugin
fills in the `models` for you:

```jsonc
{
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local",
      "options": {
        "baseURL": "http://localhost:8080/v1"
      }
    }
  }
}
```

This is the V1 config format, which OpenCode V2 still reads. The native V2 form
works too:

```jsonc
{
  "providers": {
    "local": {
      "name": "Local",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://localhost:8080/v1" }
    }
  }
}
```

A trailing `/v1` (or `/v1/`) on the `baseURL` is handled automatically.

## Logs

OpenCode V2 runs plugins in its background service, which cannot show TUI
toasts, so the plugin reports to the OpenCode log instead
(`~/.local/share/opencode/log/opencode.log`, or the terminal with
`opencode serve --print-logs`):

```
[local-model-discovery] Discovering models for provider(s): local
[local-model-discovery] Discovered 2 model(s) for provider "local":
  • llama3 (128k ctx)
  • glm-5.3
[local-model-discovery] New model "qwen3-coder" discovered for provider "local"
[local-model-discovery] Model "llama3" removed from provider "local"
[local-model-discovery] Model discovery failed for provider "local": Unable to connect. …
[local-model-discovery] Provider "local" is reachable again
```

A server that stays down is reported once, and its last known models stay
available until it comes back.

## Model metadata

Limits come from the endpoint when the server publishes them, so a vLLM entry
like this:

```json
{ "id": "DeepSeek-V4.1-Flash", "owned_by": "vllm", "max_model_len": 131072 }
```

becomes a model named `DeepSeek-V4.1-Flash` with a 131072-token context.

Field names differ between servers, so several are checked in order:

| Entry | Fields checked, in order |
|---|---|
| `limit.context` | `max_model_len` (vLLM), `context_length` (OpenRouter, Modal), `max_context_length` (LM Studio), `context_window`, `meta.n_ctx_train` (llama.cpp) |
| `limit.output` | `max_output_length`, `max_completion_tokens`, `max_output_tokens`, `top_provider.max_completion_tokens` |
| `name` | the server's own `name`, else the last path segment of the id |

A context the server does not report is written as `0`, which OpenCode treats as
unknown: it skips auto compaction rather than guessing a window. An output cap
the server does not report keeps OpenCode's default (32000 tokens).

## Known models

`/v1/models` never reports whether a model reasons or which effort levels it
accepts, so that is kept as a static table in
`opencode-local-model/discovery/known-models.ts`, matched against the model id
case-insensitively. A matching model gets the entry's settings and variants, in
OpenCode V2's model shape:

```ts
const KNOWN_MODELS: readonly KnownModel[] = [
  {
    match: /glm[\s._-]?5[\s._-]?3/i,
    config: {
      settings: { reasoningEffort: "max" },
      variants: [
        { id: "low", settings: { reasoningEffort: "low" } },
        { id: "high", settings: { reasoningEffort: "high" } },
        { id: "max", settings: { reasoningEffort: "max" } },
      ],
    },
  },
]
```

So `z-ai/glm-5.3`, `GLM-5.3-FLASH` and `glm_5_3` all pick it up, while `glm-5.2`
and `glm-4.6` do not. Add an entry to support another model; the first match
wins, so put more specific patterns first.

## Authenticated servers

If your server requires a token on `/v1/models` and completions, store it with
`opencode auth login`, choosing the provider id from your config (`local` above).
OpenCode passes that credential to the provider for completions, and the plugin
reads it back through OpenCode's credential API for discovery, so both are
authenticated from one login.

Alternatively, set `options.apiKey` (V1 format) or `settings.apiKey` (V2 format)
in the config, which takes precedence and supports OpenCode's `{env:VAR}` and
`{file:path}` substitutions:

```jsonc
"options": {
  "baseURL": "http://localhost:8080/v1",
  "apiKey": "{env:LOCAL_API_TOKEN}"
}
```

A rejected credential (HTTP 400, 401 or 403) is reported in the log.

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run lint        # Biome: lint + format check
bun run format      # Biome: apply fixes
bun run typecheck   # tsc --noEmit
bun run test        # bun test
```

`@opencode/plugin` is a dev dependency for types only; the plugin imports
nothing from it at runtime, which is what lets it load from a copied folder.

CI (`.github/workflows/ci.yml`) runs Biome, the type check and the tests on
every push and pull request.

## License

MIT, see [LICENSE](LICENSE).
