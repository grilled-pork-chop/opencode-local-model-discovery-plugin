# Installation

This archive contains the `opencode-local-model-discovery` plugin and its dependencies
for offline installation.

## Contents

```
opencode-local-model-discovery-x.x.x.tgz   ← the plugin
deps/
  opencode-ai-plugin-x.x.x.tgz             ← runtime dependency
opencode.json.example                        ← configuration template
INSTALL.md                                   ← this file
```

## Steps

### 1. Install the plugin

```bash
# with bun
bun add ./opencode-local-model-discovery-x.x.x.tgz

# with npm
npm install ./opencode-local-model-discovery-x.x.x.tgz
```

If you are in an offline environment, install the bundled dependency first:

```bash
bun add ./deps/opencode-ai-plugin-x.x.x.tgz
bun add ./opencode-local-model-discovery-x.x.x.tgz
```

### 2. Configure OpenCode

Copy `opencode.json.example` to your project root as `opencode.json` and set the `url` to
your local API endpoint:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-local-model-discovery", {
      "url": "http://localhost:11434"
    }]
  ]
}
```

Common endpoints:

| Provider  | URL                       |
|-----------|---------------------------|
| Ollama    | `http://localhost:11434`  |
| LM Studio | `http://localhost:1234`   |
| litellm   | `http://localhost:4000`   |
| LocalAI   | `http://localhost:8080`   |

### 3. Start OpenCode

OpenCode will discover and load your models automatically on startup.
