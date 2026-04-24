# Installation

This archive contains the `opencode-local-model` plugin and its dependencies.
No internet connection, npm, or bun required.

## Contents

```
opencode-local-model-x.x.x.tgz          ← the plugin
deps/
  opencode-ai-plugin-x.x.x.tgz          ← runtime dependency
opencode.json.example                     ← configuration template
install.sh                                ← installation script
INSTALL.md                                ← this file
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

tar -xzf opencode-local-model-x.x.x.tgz --strip-components=1 \
    --one-top-level=~/.config/opencode/plugins/opencode-local-model
```

### 2. Extract the dependency into the plugin

```bash
mkdir -p ~/.config/opencode/plugins/opencode-local-model/node_modules/@opencode-ai

tar -xzf deps/opencode-ai-plugin-x.x.x.tgz --strip-components=1 \
    --one-top-level=~/.config/opencode/plugins/opencode-local-model/node_modules/@opencode-ai/plugin
```

The final layout should look like:

```
~/.config/opencode/plugins/
└── opencode-local-model/
    ├── src/
    ├── node_modules/
    │   └── @opencode-ai/
    │       └── plugin/
    └── package.json
```

### 3. Configure the URL

**Option A — via `opencode.json`** (project or global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-local-model", {
      "url": "http://localhost:11434"
    }]
  ]
}
```

**Option B — via environment variable** (useful when the plugin is loaded from the
plugins folder without an opencode.json entry):

```bash
export LOCAL_MODEL_URL=http://localhost:11434
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
