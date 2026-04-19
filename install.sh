#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="opencode-local-model-discovery"
PLUGIN_DIR="${HOME}/.config/opencode/plugins/${PLUGIN_NAME}"

# Resolve paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Find tarballs
# ---------------------------------------------------------------------------

PLUGIN_TGZ=$(echo "${SCRIPT_DIR}/${PLUGIN_NAME}-"*.tgz 2>/dev/null | head -1)
DEP_TGZ=$(echo "${SCRIPT_DIR}/deps/"*.tgz 2>/dev/null | head -1)

if [[ ! -f "${PLUGIN_TGZ}" ]]; then
  echo "Error: plugin tarball not found in ${SCRIPT_DIR}" >&2
  exit 1
fi

if [[ ! -f "${DEP_TGZ}" ]]; then
  echo "Error: dependency tarball not found in ${SCRIPT_DIR}/deps/" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

echo "Installing ${PLUGIN_NAME}..."

# 1. Extract plugin
mkdir -p "${PLUGIN_DIR}"
tar -xzf "${PLUGIN_TGZ}" --strip-components=1 -C "${PLUGIN_DIR}"
echo "  ✓ plugin extracted to ${PLUGIN_DIR}"

# 2. Extract dependency
DEP_DIR="${PLUGIN_DIR}/node_modules/@opencode-ai/plugin"
mkdir -p "${DEP_DIR}"
tar -xzf "${DEP_TGZ}" --strip-components=1 -C "${DEP_DIR}"
echo "  ✓ dependency extracted to ${DEP_DIR}"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "Done. Add the plugin to your opencode.json:"
echo ""
echo '  {'
echo '    "plugin": ['
echo "      [\"${PLUGIN_NAME}\", { \"url\": \"http://localhost:11434\" }]"
echo '    ]'
echo '  }'
echo ""
echo "See INSTALL.md for the full configuration reference."
