# Installation

This archive contains the `opencode-local-model-discovery` plugin and its dependencies.
No internet connection, npm, or bun required.

## Contents

```
opencode-local-model-discovery-x.x.x.tgz   ← the plugin
deps/
  opencode-ai-plugin-x.x.x.tgz             ← runtime dependency
opencode.json.example                        ← configuration template
install.sh                                   ← installation script
INSTALL.md                                   ← this file
```

## Quick install

```bash
bash install.sh
```

That's it. The script extracts the plugin and its dependency into
`~/.config/opencode/plugins/` automatically.

---

## Manual steps (if needed)

### 1. Extract the plugin into the OpenCode plugins directory

OpenCode automatically loads plugins placed in `~/.config/opencode/plugins/`.

```bash
mkdir -p ~/.config/opencode/plugins

tar -xzf opencode-local-model-discovery-x.x.x.tgz --strip-components=1 \
    --one-top-level=~/.config/opencode/plugins/opencode-local-model-discovery
```

### 2. Extract the dependency into the plugin

```bash
mkdir -p ~/.config/opencode/plugins/opencode-local-model-discovery/node_modules/@opencode-ai

tar -xzf deps/opencode-ai-plugin-x.x.x.tgz --strip-components=1 \
    --one-top-level=~/.config/opencode/plugins/opencode-local-model-discovery/node_modules/@opencode-ai/plugin
```

The final layout should look like:

```
~/.config/opencode/plugins/
└── opencode-local-model-discovery/
    ├── src/
    ├── node_modules/
    │   └── @opencode-ai/
    │       └── plugin/
    └── package.json
```

### 3. Configure OpenCode

Copy `opencode.json.example` to `~/.config/opencode/opencode.json` (global) or to your
project root as `opencode.json` (project-level), then set the `url` to your local API endpoint:

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

| Provider  | URL                      |
|-----------|--------------------------|
| Ollama    | `http://localhost:11434` |
| LM Studio | `http://localhost:1234`  |
| litellm   | `http://localhost:4000`  |
| LocalAI   | `http://localhost:8080`  |

### 4. Start OpenCode

OpenCode will discover and load your models automatically on startup.
