const EMBEDDING_PATTERNS = /embed|rerank/i

export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "")
}

export async function discoverModels(url: string): Promise<string[]> {
  const response = await fetch(`${url}/v1/models`, {
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const body = await response.json() as Record<string, unknown>
  if (!Array.isArray(body.data)) {
    throw new Error("unexpected response shape from /v1/models")
  }

  return (body.data as { id?: unknown }[])
    .map((m) => String(m.id ?? ""))
    .filter((id) => id && !EMBEDDING_PATTERNS.test(id))
}
