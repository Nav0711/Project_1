"""
Token replenishment script for VendorLens.
Run this on a schedule (daily/weekly) — NOT manually on demand.

Usage:
    python scripts/replenish_tokens.py                    # adds 15000 tokens (default daily)
    python scripts/replenish_tokens.py --amount 50000     # custom amount
    python scripts/replenish_tokens.py --reset            # reset to full 50000

Windows Task Scheduler (daily at 9 AM):
    Action: C:\...\backend\venv\Scripts\python.exe
    Arguments: C:\...\backend\scripts\replenish_tokens.py
    Start in: C:\...\backend
"""

import json
import os
import argparse
from datetime import datetime
from pathlib import Path

TOKEN_FILE = Path(__file__).resolve().parent.parent / "token_state.json"
LOG_FILE   = Path(__file__).resolve().parent.parent / "token_replenish.log"

MAX_TOKENS     = 50_000   # hard ceiling — never exceed this
DAILY_TOPUP    = 15_000   # default tokens added per scheduled run


def load_state() -> dict:
    if TOKEN_FILE.exists():
        try:
            return json.loads(TOKEN_FILE.read_text())
        except Exception:
            pass
    return {"available_tokens": 0, "last_replenished": None}


def save_state(state: dict):
    TOKEN_FILE.write_text(json.dumps(state, indent=2))


def log(msg: str):
    entry = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(entry)
    with open(LOG_FILE, "a") as f:
        f.write(entry + "\n")


def main():
    parser = argparse.ArgumentParser(description="Replenish VendorLens scan tokens")
    parser.add_argument("--amount", type=int, default=DAILY_TOPUP,
                        help=f"Tokens to add (default: {DAILY_TOPUP})")
    parser.add_argument("--reset", action="store_true",
                        help="Reset balance to MAX_TOKENS regardless of current balance")
    parser.add_argument("--status", action="store_true",
                        help="Print current balance and exit")
    args = parser.parse_args()

    state = load_state()
    current = state.get("available_tokens", 0)

    if args.status:
        print(f"Current balance : {current:,} tokens")
        print(f"Max cap         : {MAX_TOKENS:,} tokens")
        print(f"Last replenished: {state.get('last_replenished', 'never')}")
        return

    if args.reset:
        added = MAX_TOKENS - current
        state["available_tokens"] = MAX_TOKENS
        state["last_replenished"] = datetime.now().isoformat(timespec="seconds")
        save_state(state)
        log(f"RESET: balance set to {MAX_TOKENS:,} (was {current:,}, +{added:,})")
        return

    # Normal top-up: add --amount but never exceed MAX_TOKENS
    headroom = MAX_TOKENS - current
    if headroom <= 0:
        log(f"SKIP: already at max ({current:,}/{MAX_TOKENS:,}), nothing added")
        return

    to_add = min(args.amount, headroom)
    new_balance = current + to_add
    state["available_tokens"] = new_balance
    state["last_replenished"] = datetime.now().isoformat(timespec="seconds")
    save_state(state)
    log(f"TOPUP: +{to_add:,} tokens → balance {current:,} → {new_balance:,} (cap: {MAX_TOKENS:,})")


if __name__ == "__main__":
    main()
