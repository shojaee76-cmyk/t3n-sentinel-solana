/**
 * tee-worker.ts — off-chain TEE worker stub.
 *
 * Listens for new `record_probe` requests (signaled by an HTTP call from
 * the CLI), runs the authenticated probe, and submits the verdict on-chain.
 *
 * In production this runs inside a TEE (Phala dstack / Nillion / Switchboard
 * TEE-oracle) and uses the TEE's attested key to sign the `record_probe`
 * transaction. The M2 grant milestone replaces this stub with a real TEE
 * attestation flow.
 *
 * For the M1 devnet milestone, the worker just signs locally with a regular
 * Solana keypair (the "tee-worker.json" keypair). The on-chain `vault.tee_worker`
 * field is set to that pubkey at `initialize` time.
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, KEYPAIR_PATH } from "./commands.js";
import { createServer } from "http";

const PORT = Number(process.env.PORT ?? 8788);

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

const teeWorkerPath = process.env.SENTINEL_TEE_WORKER_KEYPAIR
  ?? `${process.env.HOME}/.config/solana/tee-worker.json`;
const teeWorker = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(require("fs").readFileSync(teeWorkerPath, "utf8")))
);

const connection = new anchor.web3.Connection(RPC, "confirmed");
const wallet = new anchor.Wallet(teeWorker);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const program = new anchor.Program(/* @ts-ignore */ {}, provider);

const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), teeWorker.publicKey.toBuffer()],
  new anchor.web3.PublicKey(PROGRAM_ID)
);
const [historyPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("history"), teeWorker.publicKey.toBuffer()],
  new anchor.web3.PublicKey(PROGRAM_ID)
);

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/probe") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { provider: prov } = JSON.parse(body);
      const spec = PROVIDERS[prov];
      if (!spec) throw new Error(`Unknown provider: ${prov}`);
      const apiKey = process.env[`SENTINEL_${prov.toUpperCase()}_API_KEY`];
      if (!apiKey) throw new Error(`Missing env: SENTINEL_${prov.toUpperCase()}_API_KEY`);

      const resp = await fetch(spec.endpoint, {
        headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "t3n-sentinel-solana/0.1 (TEE)" },
      });
      const http_code = resp.status;
      const [verdict, defaultDetail] = classify(http_code);
      const detail = verdict === "VALID" ? defaultDetail : await resp.text().catch(() => defaultDetail);
      const checkedAt = Math.floor(Date.now() / 1000);

      const sig = await program.methods
        .recordProbe(prov, http_code, detail.slice(0, 96))
        .accounts({
          vault: vaultPda,
          history: historyPda,
          teeWorker: teeWorker.publicKey,
        })
        .rpc();

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        provider: prov,
        verdict,
        http_code,
        detail: verdict === "VALID" ? defaultDetail : detail.slice(0, 96),
        checked_at: checkedAt,
        tx: sig,
      }, null, 2));
    } catch (e: any) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`t3n-sentinel TEE worker listening on http://127.0.0.1:${PORT}`);
  console.log(`  tee worker pubkey: ${teeWorker.publicKey.toBase58()}`);
});
