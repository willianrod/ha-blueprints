import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  if (process.env.HA_URL && process.env.HA_TOKEN) return;
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*(HA_URL|HA_TOKEN)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
  if (!process.env.HA_URL || !process.env.HA_TOKEN) {
    console.error("Set HA_URL and HA_TOKEN (env or .env file)");
    process.exit(1);
  }
}

export function config() {
  loadEnv();
  return {
    url: process.env.HA_URL.replace(/\/+$/, ""),
    token: process.env.HA_TOKEN,
    get wsUrl() {
      return this.url.replace(/^http/, "ws") + "/api/websocket";
    },
  };
}

export async function api(method, path, body) {
  const res = await fetch(config().url + path, {
    method,
    headers: {
      Authorization: `Bearer ${config().token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

export function haWS() {
  const cfg = config();
  const ws = new WebSocket(cfg.wsUrl);
  let id = 0;
  let closed = false;
  const pending = new Map();
  const queue = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "auth_required") {
      ws.send(JSON.stringify({ type: "auth", access_token: cfg.token }));
    } else if (msg.type === "auth_ok") {
      for (const [resolve] of queue.splice(0)) resolve();
    } else if (msg.type === "auth_invalid") {
      console.error("Auth failed:", msg.message);
      process.exit(1);
    } else {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(`${msg.type}: ${JSON.stringify(msg.error)}`));
      }
    }
  };

  ws.onclose = () => {
    closed = true;
    for (const [, p] of pending) p.reject(new Error("WebSocket closed"));
  };

  return {
    /** Wait for auth, then call a websocket command. */
    async call(type, extra = {}) {
      if (ws.readyState !== WebSocket.OPEN) {
        await new Promise((resolve, reject) => {
          queue.push([resolve, reject]);
          setTimeout(() => reject(new Error("WS connect timeout")), 10000);
        });
      }
      if (closed) throw new Error("WebSocket closed");
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, type, ...extra }));
      });
    },
    close() {
      closed = true;
      ws.close();
    },
  };
}

export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "automation";
}
