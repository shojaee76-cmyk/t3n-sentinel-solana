#!/usr/bin/env node
/**
 * t3n-sentinel — Solana CLI
 *
 * Ops surface (mirrors the T3N port 1:1):
 *   sentinel init     --worker <pubkey>     Register vault + TEE worker
 *   sentinel seal     <provider>            Seal a new key (env SENTINEL_<PROVIDER>_API_KEY)
 *   sentinel list                            List providers + last verdict
 *   sentinel probe    <provider>            Run a probe (via TEE worker)
 *   sentinel rotate   <provider>            Rotate a key
 *   sentinel history                        View history ring buffer
 *
 * The off-chain TEE worker is `app/tee-worker.ts` — it listens for
 * `ProbeRequested` events, performs the authenticated HTTP GET, and calls
 * `record_probe` to write the verdict on-chain.
 */

import { Command } from "./commands.js";

const cmds: Command[] = [
  { name: "init",    run: () => import("./cmd/init.js").then(m => m.run) },
  { name: "seal",    run: () => import("./cmd/seal.js").then(m => m.run) },
  { name: "list",    run: () => import("./cmd/list.js").then(m => m.run) },
  { name: "probe",   run: () => import("./cmd/probe.js").then(m => m.run) },
  { name: "rotate",  run: () => import("./cmd/rotate.js").then(m => m.run) },
  { name: "history", run: () => import("./cmd/history.js").then(m => m.run) },
];

const [,, sub, ...rest] = process.argv;
if (!sub || sub === "--help" || sub === "-h") {
  console.log("t3n-sentinel CLI — usage:");
  for (const c of cmds) console.log(`  sentinel ${c.name} [args...]`);
  process.exit(sub ? 0 : 1);
}
const cmd = cmds.find(c => c.name === sub);
if (!cmd) {
  console.error(`Unknown subcommand: ${sub}`);
  process.exit(2);
}
const fn = (await cmd.run())(rest);
const result = await fn;
// Print canonical JSON shape (matches the T3N contract exactly).
console.log(JSON.stringify(result, null, 2));
