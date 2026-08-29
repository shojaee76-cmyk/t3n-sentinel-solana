/**
 * `sentinel probe <provider>` — request a probe.
 *
 * In production this is two-step:
 *   1. emit a `ProbeRequested` event (the off-chain TEE worker listens)
 *   2. the TEE worker calls `record_probe` with the verdict
 *
 * In this devnet milestone the probe is a one-shot: the CLI does the HTTP
 * GET itself (using a server-side TEE stub), then submits the receipt to
 * the program via `record_probe`. The TEE integration is the M2 milestone
 * (see docs/MILESTONES.md).
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, KEYPAIR_PATH } from "../commands.js";

const PROVIDERS: Record<string, { secretKey: string; endpoint: string }> = {
  github:     { secretKey: "github_api_key",     endpoint: "https://api.github.com/user" },
  groq:       { secretKey: "groq_api_key",       endpoint: "https://api.groq.com/openai/v1/models" },
  openrouter: { secretKey: "openrouter_api_key", endpoint: "https://openrouter.ai/api/v1/key" },
  openai:     { secretKey: "openai_api_key",     endpoint: "https://api.openai.com/v1/models" },
};

function classify(code: number): [string, string] {
  if (code >= 200 && code < 300) return ["VALID", "key accepted by provider"];
  if (code === 401 || code === 403) return ["INVALID", "credentials rejected by provider"];
  if (code === 429) return ["RATE_LIMITED", "quota exhausted — key likely valid"];
  return ["UNEXPECTED", "unclassified status code"];
}

export async function run(args: string[]) {
  const provider = args[0];
  if (!provider) throw new Error("Usage: sentinel probe <provider>");
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`Unknown provider: ${provider}. Known: ${Object.keys(PROVIDERS).join(", ")}`);

  const apiKey = process.env[`SENTINEL_${provider.toUpperCase()}_API_KEY`];
  if (!apiKey) throw new Error(`Missing env: SENTINEL_${provider.toUpperCase()}_API_KEY`);

  // 1. HTTP probe (the TEE worker will replace this in M2)
  const resp = await fetch(spec.endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "t3n-sentinel-solana/0.1" },
  });
  const http_code = resp.status;
  const [verdict, defaultDetail] = classify(http_code);
  const detail = verdict === "VALID" ? defaultDetail : await resp.text().catch(() => defaultDetail);
  const checkedAt = Math.floor(Date.now() / 1000);

  // 2. Submit the receipt on-chain via the TEE worker keypair.
  const teeWorkerPath = process.env.SENTINEL_TEE_WORKER_KEYPAIR
    ?? `${process.env.HOME}/.config/solana/tee-worker.json`;
  const teeWorker = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(require("fs").readFileSync(teeWorkerPath, "utf8")))
  );

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const wallet = anchor.Wallet.local(); // unused — tee_worker signs
  const provider_ = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider_);
  const program = new anchor.Program(/* @ts-ignore */ {}, provider_);

  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), teeWorker.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );
  const [historyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), teeWorker.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );

  const sig = await program.methods
    .recordProbe(provider, http_code, detail.slice(0, 96))
    .accounts({
      vault: vaultPda,
      history: historyPda,
      teeWorker: teeWorker.publicKey,
    })
    .signers([teeWorker])
    .rpc();

  // Return the canonical verdict shape (matches the T3N contract exactly).
  return {
    provider,
    verdict,
    http_code,
    detail: verdict === "VALID" ? defaultDetail : detail.slice(0, 96),
    checked_at: checkedAt,
    tx: sig,
  };
}
