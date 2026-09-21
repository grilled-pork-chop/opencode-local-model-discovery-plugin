# opencode-local-model-discovery-plugin

An [OpenCode](https://opencode.ai) plugin that **auto-discovers models** from any
OpenAI-compatible provider you already have configured, with no need to
hand-maintain a `models` list. Point it at a local server (Ollama, llama.cpp, vLLM, LM Studio,
LocalAI, …) and every model the server exposes shows up in OpenCode, kept in sync
while you work.

## How it works

The plugin scans your OpenCode config for any provider using the
`@ai-sdk/openai-compatible` adapter with an `options.baseURL`, then:

1. **Discover**: fetches `GET {baseURL}/v1/models` and filters to usable chat
   models, authenticated when the provider has a credential, reading each
   model's reported limits along the way.
2. **Inject**: replaces the provider's `models` map with what the server reports
   (the API is the source of truth, so removed models drop out too).
3. **Poll**: re-checks every 15 seconds in the background and toasts whenever a
   model is added or removed, so a freshly-pulled model appears without a restart.

Discovery results (and any errors) are surfaced as TUI toasts. If no compatible
provider is found, the plugin does nothing.

## Install

Drop the plugin into your OpenCode plugin directory:

```bash
git clone https://github.com/grilled-pork-chop/opencode-local-model-discovery-plugin \
  ~/.config/opencode/plugin/opencode-local-model-discovery-plugin
```

Then declare an OpenAI-compatible provider in your `opencode.jsonc`. The plugin
fills in the `models` for you:

```jsonc
{
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      }
    }
  }
}
```

Start OpenCode and you'll get a toast listing the discovered models. A trailing
`/v1` (or `/v1/`) on the `baseURL` is handled automatically.

## Model metadata

Limits come from the endpoint when the server publishes them, so a vLLM entry
like this:

```json
{ "id": "DeepSeek-V4.1-Flash", "owned_by": "vllm", "max_model_len": 131072 }
```

becomes:

```jsonc
"models": {
  "DeepSeek-V4.1-Flash": {
    "name": "DeepSeek-V4.1-Flash",
    "limit": { "context": 131072, "output": 32000 }
  }
}
```

Field names differ between servers, so several are checked in order:

| Entry | Fields checked, in order |
|---|---|
| `limit.context` | `max_model_len` (vLLM), `context_length` (OpenRouter, Modal), `max_context_length` (LM Studio), `context_window`, `meta.n_ctx_train` (llama.cpp) |
| `limit.output` | `max_output_length`, `max_completion_tokens`, `max_output_tokens`, `top_provider.max_completion_tokens` |
| `name` | the server's own `name`, else the last path segment of the id |

Most servers report a context window but no output cap. A flat default is wrong
in both directions there: too small truncates long replies on a large model, too
large breaks a small one, because servers that enforce
`prompt + max_tokens <= context`, vLLM among them, reject the request outright.
So the output cap is derived from the window the server reported, a quarter of
it, capped at 32000 to match OpenCode's own ceiling:

| Reported context | Output cap applied |
|---|---|
| 131072 | 32000 |
| 32768 | 8192 |
| 8192 | 2048 |
| none | `limit` omitted, OpenCode's defaults apply |

Anything you write yourself in `opencode.jsonc` wins over the discovered value,
field by field, so pinning one model's output cap leaves everything else
tracking the server:

```jsonc
"provider": {
  "local": {
    "models": {
      "DeepSeek-V4.1-Flash": { "limit": { "output": 4096 } }
    }
  }
}
```

The API still decides which models exist, so a model the server stops serving
disappears even if you declared it.

## Authenticated servers

If your server requires a token on `/v1/models` and completions, store it with
`opencode auth login`:

```bash
opencode auth login
# Select provider → Other
# Enter provider id → local        ← must match the key in your config
# API key          → •••
```

OpenCode passes that credential to the provider for completions, and the plugin
reads it back for discovery, so both are authenticated from one login. **The
provider id you type has to match the provider key in your config exactly**. A
mismatch stores an orphan credential and discovery fails.

Alternatively, set `options.apiKey` in the config, which takes precedence and
supports OpenCode's `{env:VAR}` and `{file:path}` substitutions:

```jsonc
"options": {
  "baseURL": "http://localhost:11434/v1",
  "apiKey": "{env:LOCAL_API_TOKEN}"
}
```

Credentials are read from OpenCode's `auth.json` (`$XDG_DATA_HOME/opencode`,
defaulting to `~/.local/share/opencode`), or from `OPENCODE_AUTH_CONTENT` when
set, matching OpenCode's own lookup order. OpenCode exposes no read API for
credentials and hands them to plugins only after the config hook has run, so
reading the file is the only way to authenticate discovery. Any failure to read
it degrades to "no credential", which surfaces as a 401 toast pointing at
`opencode auth login`.

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run lint        # Biome: lint + format check
bun run format      # Biome: apply fixes
bun run typecheck   # tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs Biome and the type check on every push and
pull request.

## License

MIT, see [LICENSE](LICENSE).
