# opencode-local-model

OpenCode plugin that automatically discovers models from any local OpenAI-compatible API and injects them into OpenCode as a `local` provider. Point it at Ollama, LM Studio, litellm, LocalAI, or any server that exposes a `/v1/models` endpoint.

---

## Quick start

### 1. Install the plugin

```bash
bun add opencode-local-model
# or
npm install opencode-local-model
```

### 2. Configure OpenCode

Add the plugin to your `opencode.json`:

```json
{
  "plugin": [
    ["opencode-local-model", {
      "url": "http://localhost:11434"
    }]
  ]
}
```

When OpenCode starts, it queries `{url}/v1/models`, discovers your models, and makes them available under the `local` provider in the model picker. Embedding and reranker models are filtered out automatically.

---

## Plugins folder install (no opencode.json entry)

If you drop the plugin directly into `~/.config/opencode/plugins/opencode-local-model/`, set the URL via environment variable instead:

```bash
export LOCAL_MODEL_URL=http://localhost:11434
```

The plugin reads `LOCAL_MODEL_URL` when no `url` option is provided in `opencode.json`.

---

## Common setups

| Provider | Default URL |
|----------|-------------|
| [Ollama](https://ollama.com) | `http://localhost:11434` |
| [LM Studio](https://lmstudio.ai) | `http://localhost:1234` |
| [litellm](https://github.com/BerriAI/litellm) | `http://localhost:4000` |
| [LocalAI](https://localai.io) | `http://localhost:8080` |

### litellm + VLLM example

```yaml
# litellm_config.yaml
model_list:
  - model_name: meta/llama3-8b
    litellm_params:
      model: openai/meta/llama3-8b
      api_base: http://localhost:8000/v1   # VLLM server
      api_key: none
```

```bash
litellm --config litellm_config.yaml --port 4000
```

```json
{
  "plugin": [
    ["opencode-local-model", { "url": "http://localhost:4000" }]
  ]
}
```

---

## How it works

1. On startup, the plugin calls `GET {url}/v1/models`
2. Embedding and reranker models are filtered out
3. Discovered models are injected into `config.provider.local` using `@ai-sdk/openai-compatible`
4. Results are cached for `ttl` milliseconds — subsequent startups within that window skip the network request
5. Toast notifications confirm success, failure, and model changes (added/removed)

---

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `LOCAL_MODEL_URL` env var | Base URL of the local API, without trailing slash |
| `ttl` | `number` | `15000` | Cache duration in milliseconds before models are re-fetched |

---

## Provider shape injected

```json
{
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "llama3:8b": {
          "id": "llama3:8b",
          "name": "llama3:8b",
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

Models you explicitly define under `provider.local` in your `opencode.json` are never overwritten — the plugin only injects models not already configured.

---

## Development

```bash
bun install          # install dependencies
bun run typecheck    # TypeScript type check
bun run test:run     # run tests once
bun run test         # run tests in watch mode
bun run build        # typecheck + tests
```

## Packaging

```bash
bun run pack
```

Runs typecheck and tests, then produces a self-contained distribution archive:

```
opencode-local-model-dist-x.x.x.tar.gz
├── opencode-local-model-x.x.x.tgz          ← the plugin
├── deps/
│   └── opencode-ai-plugin-x.x.x.tgz        ← runtime dependency
├── opencode.json.example                     ← configuration template
├── install.sh                                ← offline install script
└── INSTALL.md                                ← installation guide
```

Hand this archive to anyone who needs to install the plugin — online or offline. See `INSTALL.md` inside the archive for installation steps.

---

## License

MIT
