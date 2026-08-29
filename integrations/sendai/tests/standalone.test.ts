/**
 * Standalone tests for the SendAI adapter — no @coral-xyz/anchor needed.
 * Verifies PDA derivation, config shape, and the M1 getKey() guard.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { PublicKey } from "@solana/web3.js";
import { SentinelVault, SentinelPlugin } from "../index.js";

const TEST_PROGRAM_ID = "t3nSent1ne1So1anaPubkey11111111111111111111";
const TEST_AUTHORITY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("SentinelVault: string config", () => {
  const v = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.ok(v);
});

test("SentinelVault: PublicKey config", () => {
  const v = new SentinelVault({
    programId: new PublicKey(TEST_PROGRAM_ID),
    teeWorker: new PublicKey(TEST_AUTHORITY),
    vaultAuthority: new PublicKey(TEST_AUTHORITY),
  });
  assert.ok(v);
});

test("vaultPda: deterministic", () => {
  const a = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  const b = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.equal(a.vaultPda().toBase58(), b.vaultPda().toBase58());
});

test("secretPda: differs per provider", () => {
  const v = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.notEqual(v.secretPda("github").toBase58(), v.secretPda("openai").toBase58());
  assert.notEqual(v.secretPda("groq").toBase58(), v.secretPda("openrouter").toBase58());
});

test("getKey: M1 guard (throws)", async () => {
  const v = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  await assert.rejects(
    () => v.getKey("github", {} as any),
    /M2 feature/
  );
});

test("SentinelPlugin: wrap calls probe before fn", async () => {
  const plugin = SentinelPlugin({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });

  let probeCalled = false;
  let fnCalled = false;
  // mock the probe method
  plugin.vault.probe = async (provider: string) => {
    probeCalled = true;
    return {
      provider,
      verdict: "VALID" as const,
      http_code: 200,
      detail: "test",
      checked_at: Math.floor(Date.now() / 1000),
      tx: "mock-tx",
    };
  };

  const wrapped = plugin.wrap("github", async (x: number) => {
    fnCalled = true;
    return x * 2;
  });

  const result = await wrapped(21);
  assert.equal(result, 42);
  assert.equal(probeCalled, true);
  assert.equal(fnCalled, true);
});
