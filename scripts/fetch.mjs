import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { api, haWS, slugify } from "./ha.mjs";

const DIR = join(process.cwd(), "automations");

async function main() {
  await mkdir(DIR, { recursive: true });

  const ws = haWS();
  const registry = await ws.call("config/entity_registry/list");
  const autos = registry.filter((e) => e.entity_id.startsWith("automation."));
  ws.close();

  // map automation id -> existing filename (handles renames)
  const existing = {};
  for (const file of await readdir(DIR)) {
    if (!file.endsWith(".yaml")) continue;
    const doc = parse(await readFile(join(DIR, file), "utf8"));
    if (doc?.id) existing[doc.id] = file;
  }

  const usedNames = new Set();
  const written = [];

  for (const entry of autos) {
    const id = entry.unique_id;
    const cfg = await api("GET", `/api/config/automation/config/${id}`);
    if (!cfg) {
      console.log(`skip ${entry.entity_id} (no config)`);
      continue;
    }

    let name = existing[id] ?? `${slugify(cfg.alias ?? id)}.yaml`;
    // avoid collision with a different automation's file
    if (usedNames.has(name)) name = `${slugify(cfg.alias ?? id)}-${id.slice(-4)}.yaml`;
    usedNames.add(name);

    const out = stringify(cfg, { lineWidth: 120 });
    await writeFile(join(DIR, name), out, "utf8");
    written.push({ name, id, alias: cfg.alias });
    console.log(`saved ${name}  (id=${id}, entity=${entry.entity_id})`);
  }

  // report stale files (automation deleted on HA) without touching them
  const currentIds = new Set(written.map((w) => w.id));
  const onDisk = new Set(written.map((w) => w.name));
  for (const [id, file] of Object.entries(existing)) {
    if (!currentIds.has(id) && !onDisk.has(file)) {
      console.log(`stale: ${file} (id=${id} no longer on Home Assistant)`);
    }
  }

  console.log(`\n${written.length} automations saved to ${DIR}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
