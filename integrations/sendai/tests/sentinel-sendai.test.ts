/**
 * Tests for the Solana Agent Kit adapter. The unit tests verify the PDA
 * derivation + config shape; the live integration test (run with a real
 * TEE worker on devnet) is in `tests/integration.test.ts`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { PublicKey } from "@solana/web3.js";
import { SentinelVault } from "../index.js";

const TEST_PROGRAM_ID = "t3nSent1ne1So1anaPubkey11111111111111111111";
const TEST_AUTHORITY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC mint as a stand-in pubkey

test("SentinelVault constructs from string config", () => {
  const vault = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.ok(vault);
});

test("SentinelVault constructs from PublicKey config", () => {
  const vault = new SentinelVault({
    programId: new PublicKey(TEST_PROGRAM_ID),
    teeWorker: new PublicKey(TEST_AUTHORITY),
    vaultAuthority: new PublicKey(TEST_AUTHORITY),
  });
  assert.ok(vault);
});

test("vaultPda is deterministic", () => {
  const v1 = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  const v2 = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  assert.equal(v1.vaultPda().toBase58(), v2.vaultPda().toBase58());
});

test("secretPda differs per provider", () => {
  const v = new SentinelVault({
    programId: TEST_PROGRAM_ID,
    teeWorker: TEST_AUTHORITY,
    vaultAuthority: TEST_AUTHORITY,
  });
  const github = v.secretPda("github").toBase58();
  const openai = v.secretPda("openai").toBase58();
  assert.notEqual(github, openai);
});

test("getKey throws on M1 (key is in TEE worker only)", async () => {
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
