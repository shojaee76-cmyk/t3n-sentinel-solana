/**
 * `sentinel list` — list providers + last verdict per provider.
 *
 * Mirrors the T3N `list-providers` instruction: returns a JSON object with
 * a `providers` array, each entry containing `provider`, `endpoint`,
 * `sealed` (bool), and `last` (the last probe verdict, or null).
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, KEYPAIR_PATH } from "../commands.js";

export async function run(args: string[]) {
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const keypair = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(require("fs").readFileSync(KEYPAIR_PATH, "utf8")))
  );
  const wallet = new anchor.Wallet(keypair);
  const provider_ = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider_);
  const program = new anchor.Program(/* @ts-ignore */ {}, provider_);

  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );
  const [historyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), wallet.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );

  const tx = await program.methods
    .listProviders()
    .accounts({ vault: vaultPda, history: historyPda, caller: wallet.publicKey })
    .rpc();

  // The on-chain JSON is in the tx logs. Parse it.
  const parsed = await connection.getParsedTransaction(tx, "confirmed");
  const log = parsed?.meta?.logMessages?.find(l => l.includes('"providers"'));
  if (!log) return { providers: [], tx };
  return JSON.parse(log.split("Program log: ").pop()!);
}
