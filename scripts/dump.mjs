import { writeFileSync } from "node:fs";
import { api, haWS } from "./ha.mjs";

async function main() {
  const ws = haWS();
  const [areas, devices, entities] = await Promise.all([
    ws.call("config/area_registry/list"),
    ws.call("config/device_registry/list"),
    ws.call("config/entity_registry/list"),
  ]);
  ws.close();
  const states = await api("GET", "/api/states");
  const out = { areas, devices, entities, states };
  writeFileSync("/tmp/opencode/ha-dump.json", JSON.stringify(out, null, 1));
  console.log(`areas: ${areas.length}, devices: ${devices.length}, entities: ${entities.length}, states: ${states.length}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
