import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { api } from "./ha.mjs";

const DIR = join(process.cwd(), "automations");

async function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length) {
    files = args;
  } else {
    files = (await readdir(DIR)).filter((f) => f.endsWith(".yaml")).map((f) => join(DIR, f));
  }

  for (const file of files) {
    const cfg = parse(await readFile(file, "utf8"));
    if (!cfg?.id) {
      console.error(`skip ${file}: no 'id' field (run "npm run fetch" first)`);
      continue;
    }
    const res = await api("POST", `/api/config/automation/config/${cfg.id}`, cfg);
    console.log(`pushed ${file}  (id=${cfg.id}) -> ${JSON.stringify(res)}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
