/**
 * @module auth/credentials
 *
 * Resolves the bearer token used to authenticate `/v1/models`.
 *
 * OpenCode V2 owns credentials: it imports the V1 `auth.json` into its own
 * store and exposes them to plugins through `ctx.integration.connection`, so
 * the plugin no longer reads any file itself.
 *
 * Every failure mode degrades to "no credential", which surfaces as an
 * authentication error in the log.
 */

import type { ProviderEntry } from "../discovery/scanner"

/** A stored credential as returned by `ctx.integration.connection.resolve`. */
type Credential = { type: "key"; key: string } | { type: "oauth"; access: string }

/** The part of V2's `ctx.integration` used to look up stored credentials. */
export interface IntegrationLike {
  readonly connection: {
    active(integrationID: string): Promise<unknown>
    // biome-ignore lint/suspicious/noExplicitAny: the connection value is opaque and passed straight back
    resolve(connection: any): Promise<unknown>
  }
}

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
  integration: IntegrationLike,
  provider: ProviderEntry
): Promise<string | undefined> {
  if (provider.apiKey) return provider.apiKey
  try {
    const connection = await integration.connection.active(provider.key)
    if (!connection) return undefined
    const credential = (await integration.connection.resolve(connection)) as Credential | undefined
    if (credential?.type === "key") return credential.key || undefined
    if (credential?.type === "oauth") return credential.access || undefined
  } catch {
    // A missing or unreadable credential must not block discovery.
  }
  return undefined
}
