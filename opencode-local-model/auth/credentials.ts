/**
 * @module auth/credentials
 *
 * Reads the credentials written by `opencode auth login`.
 *
 * OpenCode deliberately exposes no read API for credentials. The server offers
 * only `auth.set` and `auth.remove`, and the `auth.loader` hook receives them
 * after every plugin `config` hook has already run, so reading `auth.json` is
 * the only way to authenticate discovery at config time.
 *
 * Every failure mode degrades to "no credential", which surfaces as a 401 and a
 * toast telling the user to log in.
 */

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/** A single entry in OpenCode's `auth.json`. */
type StoredAuth =
  | { type: "api"; key: string; metadata?: Record<string, string> }
  | { type: "oauth"; access: string; refresh: string; expires: number }
  | { type: "wellknown"; key: string; token: string }

/** Mirrors opencode's `Global.Path.data` (xdg-basedir, same on macOS/Windows). */
function authFile(): string {
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "opencode",
    "auth.json"
  )
}

/**
 * Loads every stored credential. `OPENCODE_AUTH_CONTENT` takes precedence over
 * the file, matching OpenCode's own lookup order.
 */
async function readAuth(): Promise<Record<string, StoredAuth>> {
  const raw =
    process.env.OPENCODE_AUTH_CONTENT ?? (await readFile(authFile(), "utf8").catch(() => ""))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, StoredAuth>) : {}
  } catch {
    return {}
  }
}

/**
 * Resolves the token `opencode auth login` stored for a provider.
 *
 * @param providerKey - Provider key from the opencode config. The credential is
 *                      stored under the same id the user typed at login.
 * @returns The token to send as `Authorization: Bearer`, or `undefined`.
 */
export async function loadToken(providerKey: string): Promise<string | undefined> {
  const entry = (await readAuth())[providerKey.replace(/\/+$/, "")]
  if (entry?.type === "api") return entry.key || undefined
  if (entry?.type === "oauth") return entry.access || undefined
  if (entry?.type === "wellknown") return entry.token || undefined
  return undefined
}
