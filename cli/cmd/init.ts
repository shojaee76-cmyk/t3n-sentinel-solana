/**
 * `sentinel init --worker <pubkey>` — one-time vault setup.
 *
 * Creates the vault PDA + history PDA; the worker pubkey is the off-chain
 * TEE adapter that will be allowed to call `record_probe` later.
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, requireEnv, KEYPAIR_PATH } from "../commands.js";

export async function run(args: string[]) {
  const workerArg = args.find(a => a.startsWith("--worker="))?.split("=")[1];
  if (!workerArg) throw new Error("Usage: sentinel init --worker=<TEE_WORKER_PUBKEY>");

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const keypair = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(require("fs").readFileSync(KEYPAIR_PATH, "utf8")))
  );
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(/* @ts-ignore */ {}, provider);

  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );
  const [historyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("history"), wallet.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );

  const sig = await program.methods
    .initialize(new anchor.web3.PublicKey(workerArg))
    .accounts({
      vault: vaultPda,
      history: historyPda,
      authority: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return {
    status: "initialized",
    vault: vaultPda.toBase58(),
    history: historyPda.toBase58(),
    tee_worker: workerArg,
    tx: sig,
  };
}
