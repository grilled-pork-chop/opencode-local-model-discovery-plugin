/**
 * @module auth/credentials
 *
 * Resolves the bearer token used to authenticate `/v1/models`.
 *
 * OpenCode V2 owns credentials: it imports the V1 `auth.json` into its own
 * store and hands them to plugins through `ctx.integration.connection`, so the
 * plugin no longer reads any file itself.
 *
 * Every failure mode degrades to "no credential", which surfaces as an
 * authentication error in the log.
 */

import type { Plugin } from "@opencode/plugin"
import type { ProviderEntry } from "../discovery/scanner"

/**
 * Resolves the credential for a provider.
 *
 * An explicitly configured `options.apiKey` wins. OpenCode resolves its
 * `{env:VAR}` and `{file:path}` placeholders before plugins see the settings,
 * so the value is always the real key. Otherwise the credential stored with
 * `opencode auth login` under the provider's id is used.
 *
 * @param integration - `ctx.integration` from the plugin context.
 * @param provider    - Provider to resolve a credential for.
 * @returns The token to send as `Authorization: Bearer`, or `undefined`.
 */
export async function resolveToken(
  integration: Plugin.Context["integration"],
  provider: ProviderEntry
): Promise<string | undefined> {
  if (provider.apiKey) return provider.apiKey
  try {
    const connection = await integration.connection.active(provider.key)
    const credential = connection ? await integration.connection.resolve(connection) : undefined
    if (credential?.type === "key") return credential.key || undefined
    if (credential?.type === "oauth") return credential.access || undefined
  } catch {
    // A missing or unreadable credential must not block discovery.
  }
  return undefined
}
