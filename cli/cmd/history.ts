/**
 * `sentinel history` — view the history ring buffer (newest first).
 *
 * Mirrors the T3N `history` instruction: same JSON shape, same iteration
 * order. The on-chain program emits the JSON via `msg!()` and the CLI
 * parses it back out.
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
    .history()
    .accounts({ vault: vaultPda, history: historyPda })
    .rpc();

  const parsed = await connection.getParsedTransaction(tx, "confirmed");
  const log = parsed?.meta?.logMessages?.find(l => l.includes('"history"'));
  if (!log) return { history: [], tx };
  return JSON.parse(log.split("Program log: ").pop()!);
}
