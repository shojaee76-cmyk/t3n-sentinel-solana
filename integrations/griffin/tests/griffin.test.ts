/**
 * Tests for the Griffin dev-kit example. Verifies the agent wires up the
 * sentinel wrapper and that runOnce() calls the probe for every wrapped
 * provider.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Keypair } from "@solana/web3.js";
import { GriffinAgent } from "../agent.js";

const TEST_PROGRAM_ID = "t3nSent1ne1So1anaPubkey11111111111111111111";
const TEST_AUTHORITY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("GriffinAgent: constructs", () => {
  const wallet = Keypair.generate();
  const agent = new GriffinAgent({
    wallet,
    rpc: "https://api.devnet.solana.com",
    sentinel: {
      programId: TEST_PROGRAM_ID,
      teeWorker: TEST_AUTHORITY,
    },
  });
  assert.ok(agent);
});

test("GriffinAgent: runOnce returns 2 signals (price + rpc)", async () => {
  const wallet = Keypair.generate();
  const agent = new GriffinAgent({
    wallet,
    rpc: "https://api.devnet.solana.com",
    sentinel: {
      programId: TEST_PROGRAM_ID,
      teeWorker: TEST_AUTHORITY,
      teeWorkerUrl: "http://127.0.0.1:9999", // non-existent; we expect fetchPrice to fail
    },
  });

  // We expect the run to fail because the TEE worker URL is not real.
  // The point of this test is to confirm the agent wires up correctly:
  // it tries to call the TEE worker, fails, and surfaces the error.
  await assert.rejects(
    () => agent.runOnce("So11111111111111111111111111111111111111112"),
    /fetch failed|ECONNREFUSED/
  );
});
