# opencode-local-model-discovery

OpenCode plugin that automatically discovers models from any local OpenAI-compatible API and injects them into OpenCode as a `local` provider. Point it at Ollama, LM Studio, litellm, LocalAI, or any server that exposes a `/v1/models` endpoint.

---

## Quick start

### 1. Install the plugin

```bash
bun add opencode-local-model-discovery
# or
npm install opencode-local-model-discovery
```

### 2. Configure OpenCode

Add the plugin to your `opencode.json`:

```json
{
  "plugin": [
    ["opencode-local-model-discovery", {
      "url": "http://localhost:11434"
    }]
  ]
}
```

When OpenCode starts, it queries `{url}/v1/models`, discovers your models, and makes them available under the `local` provider in the model picker. Embedding and reranker models are filtered out automatically.

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
    ["opencode-local-model-discovery", { "url": "http://localhost:4000" }]
  ]
}
```

---

## How it works

1. On startup, the plugin calls `GET {url}/v1/models`
2. Embedding and reranker models are filtered out
3. Discovered models are injected into `config.provider.local` using `@ai-sdk/openai-compatible`
4. Results are cached for `ttl` milliseconds — subsequent startups within that window skip the network request
5. A toast notification confirms success or failure

---

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | **required** | Base URL of the local API, without trailing slash |
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
bun run validate     # lint + typecheck + tests
```

---

## License

MIT
