#!/usr/bin/env bash
# deploy.sh — build + deploy t3n-sentinel to Solana devnet.
#
# Prereqs:
#   - solana CLI 2.3.13 in PATH (or set SOLANA_BIN)
#   - anchor CLI in PATH (or set ANCHOR_BIN)
#   - keypair at $HOME/.config/solana/id.json (or set SENTINEL_KEYPAIR)
#   - enough SOL on devnet (use `solana airdrop 2`)

set -euo pipefail
SOLANA_BIN="${SOLANA_BIN:-solana}"
ANCHOR_BIN="${ANCHOR_BIN:-anchor}"

echo "==> 1. Build the program"
cd "$(dirname "$0")/.."
"$ANCHOR_BIN" build

echo "==> 2. Show the program id (derived from keypair)"
"$SOLANA_BIN" address -k "$HOME/.config/solana/id.json"

echo "==> 3. Deploy to devnet"
"$ANCHOR_BIN" deploy --provider.cluster devnet

echo "==> 4. Save program id to .env"
PROG_ID=$("$SOLANA_BIN" address -k "$HOME/.config/solana/id.json")
echo "SENTINEL_PROGRAM_ID=$PROG_ID" >> .env
echo "    → wrote SENTINEL_PROGRAM_ID=$PROG_ID"

echo
echo "Done. Next:"
echo "  cd cli && npm install"
echo "  sentinel init --worker=<TEE_WORKER_PUBKEY>"
echo "  sentinel seal github     # uses \$SENTINEL_GITHUB_API_KEY"
echo "  sentinel probe github"
echo "  sentinel history"
