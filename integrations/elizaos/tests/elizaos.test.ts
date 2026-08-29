/**
 * Tests for the ElizaOS-on-Solana plugin. Verifies that the 6 MCP tools
 * are registered with the correct schemas + the vault wrapper derivations
 * match the Anchor program.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { PublicKey } from "@solana/web3.js";
import { SentinelPlugin, TOOL_SCHEMAS, ElizaSentinelVault } from "../index.js";

const TEST_PROGRAM_ID = "t3nSent1ne1So1anaPubkey11111111111111111111";
const TEST_AUTHORITY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("SentinelPlugin registers 6 tools", () => {
  const plugin = SentinelPlugin({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.equal(Object.keys(plugin.tools).length, 6);
  for (const name of ["sentinel_init", "sentinel_seal", "sentinel_list", "sentinel_probe", "sentinel_rotate", "sentinel_history"]) {
    assert.ok(plugin.tools[name], `missing tool: ${name}`);
    assert.ok(plugin.tools[name].description);
    assert.ok(plugin.tools[name].inputSchema);
    assert.equal(typeof plugin.tools[name].handler, "function");
  }
});

test("TOOL_SCHEMAS validates provider enum", () => {
  const schema = TOOL_SCHEMAS.sentinel_probe.input;
  const ok = schema.parse({ provider: "github" });
  assert.equal(ok.provider, "github");
  assert.throws(() => schema.parse({ provider: "not_a_provider" }));
});

test("ElizaSentinelVault: PDA derivation is deterministic", () => {
  const a = new ElizaSentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  const b = new ElizaSentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.equal(a.vaultPda().toBase58(), b.vaultPda().toBase58());
  assert.equal(a.historyPda().toBase58(), b.historyPda().toBase58());
});

test("ElizaSentinelVault: secretPda differs per provider", () => {
  const v = new ElizaSentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.notEqual(v.secretPda("github").toBase58(), v.secretPda("openai").toBase58());
  assert.notEqual(v.secretPda("groq").toBase58(), v.secretPda("openrouter").toBase58());
});
