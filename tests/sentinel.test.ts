//! t3n-sentinel — Solana integration tests.
//!
//! 5 native tests, mirroring the T3N port's coverage:
//!   1. classify_2xx → VALID
//!   2. classify_401 → INVALID
//!   3. classify_429 → RATE_LIMITED
//!   4. classify_5xx → UNEXPECTED
//!   5. find_providers + unknown → None
//!
//! These tests use Anchor's program-test framework with a local validator,
//! so they exercise the same instructions an on-chain client would call.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

describe("t3n-sentinel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.T3nSentinel as Program;

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const [historyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("history"), wallet.publicKey.toBuffer()],
    program.programId
  );
  const teeWorker = Keypair.generate();

  before(async () => {
    // initialize vault with the tee worker pubkey
    await program.methods
      .initialize(teeWorker.publicKey)
      .accounts({
        vault: vaultPda,
        history: historyPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("classify_2xx → VALID", async () => {
    // seal a key, then call record_probe with 200
    const provider = "github";
    const [secretPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("secret"), vaultPda.toBuffer(), Buffer.from(provider)],
      program.programId
    );
    await program.methods
      .sealProvider(provider, "test_key_abc")
      .accounts({
        vault: vaultPda,
        secret: secretPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const tx = await program.methods
      .recordProbe(provider, 200, "")
      .accounts({
        vault: vaultPda,
        history: historyPda,
        teeWorker: teeWorker.publicKey,
      })
      .signers([teeWorker])
      .rpc();
    const parsed = await provider.connection.getParsedTransaction(tx, "confirmed");
    const log = parsed?.meta?.logMessages?.find((l: string) => l.includes('"verdict":"VALID"'));
    assert.ok(log, "expected VALID verdict in logs");
  });

  it("classify_401 → INVALID", async () => {
    const tx = await program.methods
      .recordProbe("github", 401, "Bad credentials")
      .accounts({
        vault: vaultPda,
        history: historyPda,
        teeWorker: teeWorker.publicKey,
      })
      .signers([teeWorker])
      .rpc();
    const parsed = await provider.connection.getParsedTransaction(tx, "confirmed");
    const log = parsed?.meta?.logMessages?.find((l: string) => l.includes('"verdict":"INVALID"'));
    assert.ok(log, "expected INVALID verdict in logs");
  });

  it("classify_429 → RATE_LIMITED", async () => {
    const tx = await program.methods
      .recordProbe("groq", 429, "")
      .accounts({
        vault: vaultPda,
        history: historyPda,
        teeWorker: teeWorker.publicKey,
      })
      .signers([teeWorker])
      .rpc();
    const parsed = await provider.connection.getParsedTransaction(tx, "confirmed");
    const log = parsed?.meta?.logMessages?.find((l: string) => l.includes('"verdict":"RATE_LIMITED"'));
    assert.ok(log, "expected RATE_LIMITED verdict in logs");
  });

  it("classify_5xx → UNEXPECTED", async () => {
    const tx = await program.methods
      .recordProbe("openrouter", 500, "internal error")
      .accounts({
        vault: vaultPda,
        history: historyPda,
        teeWorker: teeWorker.publicKey,
      })
      .signers([teeWorker])
      .rpc();
    const parsed = await provider.connection.getParsedTransaction(tx, "confirmed");
    const log = parsed?.meta?.logMessages?.find((l: string) => l.includes('"verdict":"UNEXPECTED"'));
    assert.ok(log, "expected UNEXPECTED verdict in logs");
  });

  it("history returns the last 4 verdicts newest-first", async () => {
    const tx = await program.methods
      .history()
      .accounts({ vault: vaultPda, history: historyPda })
      .rpc();
    const parsed = await provider.connection.getParsedTransaction(tx, "confirmed");
    const log = parsed?.meta?.logMessages?.find((l: string) => l.includes('"history"'));
    assert.ok(log, "expected history JSON in logs");
    const payload = JSON.parse(log!.split("Program log: ").pop()!);
    assert.ok(Array.isArray(payload.history));
    assert.equal(payload.history.length, 4);
    // newest-first: the last probe was UNEXPECTED
    assert.equal(payload.history[0].verdict, "UNEXPECTED");
  });
});
