/** AgentRouter menolak request polos ("unauthorized client detected"). Tambah fingerprint Claude Code khusus host itu, provider lain tidak tersentuh. */
const HOST = "agentrouter.org";
const HEADERS = {
  "User-Agent": "claude-cli/1.0.108 (external, cli)",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
  "anthropic-dangerous-direct-browser-access": "true",
  "x-app": "cli",
  "x-stainless-lang": "js",
  "x-stainless-package-version": "0.55.1",
  "x-stainless-os": "Windows",
  "x-stainless-arch": "x64",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v22.0.0",
};

const origFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const raw = typeof input === "string" ? input : (input?.url ?? String(input));
  try {
    if (!new URL(raw).hostname.endsWith(HOST)) return origFetch(input, init);
  } catch {
    return origFetch(input, init);
  }
  const base = init.headers ?? (typeof input !== "string" ? input.headers : undefined);
  const headers = new Headers(base);
  for (const [k, v] of Object.entries(HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return origFetch(input, { ...init, headers });
};

export const AgentRouterHeaders = async () => ({});
