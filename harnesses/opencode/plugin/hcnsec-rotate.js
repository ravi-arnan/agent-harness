/** HCN SEC: rotasi API key (round-robin) khusus host itu, provider lain tidak tersentuh. Pool di secrets/hcnsec.keys (satu key per baris). Pola sama seperti plugin/agentrouter-headers.js. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOST = "api.hcnsec.cn";
const KEYS_FILE = join(homedir(), ".config", "opencode", "secrets", "hcnsec.keys");
let idx = 0;

function loadKeys() {
  try {
    return readFileSync(KEYS_FILE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const origFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const raw = typeof input === "string" ? input : (input?.url ?? String(input));
  try {
    if (!new URL(raw).hostname.endsWith(HOST)) return origFetch(input, init);
  } catch {
    return origFetch(input, init);
  }
  const keys = loadKeys();
  if (keys.length === 0) return origFetch(input, init);
  const key = keys[idx % keys.length];
  idx += 1;
  const base = init.headers ?? (typeof input !== "string" ? input.headers : undefined);
  const headers = new Headers(base);
  headers.set("Authorization", `Bearer ${key}`);
  return origFetch(input, { ...init, headers });
};

export const HcnsecRotate = async () => ({});
