import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { api, haWS } from "./ha.mjs";

const REPO_RAW = "https://raw.githubusercontent.com/willianrod/ha-blueprints/refs/heads/main";

function parseArgs(argv) {
  const opts = { files: [], path: null, noSourceUrl: false, reload: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--path") opts.path = argv[++i];
    else if (a === "--no-source-url") opts.noSourceUrl = true;
    else if (a === "--reload") opts.reload = true;
    else opts.files.push(a);
  }
  if (!opts.files.length) {
    console.error("Usage: node scripts/push-blueprint.mjs <blueprint.yaml> [...] [--path willianrod/x.yaml] [--no-source-url] [--reload]");
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ws = haWS();

  for (const file of opts.files) {
    const yamlText = await readFile(file, "utf8");
    const path = opts.path ?? `willianrod/${basename(file)}`;
    const res = await ws.call("blueprint/save", {
      domain: "automation",
      path,
      yaml: yamlText,
      ...(opts.noSourceUrl ? {} : { source_url: `${REPO_RAW}/${basename(file)}` }),
      allow_override: true,
    });
    console.log(`pushed ${file} -> ${path} ${JSON.stringify(res)}`);
  }

  if (opts.reload) {
    await api("POST", "/api/services/automation/reload", {});
    console.log("automations reloaded");
  }

  ws.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
