"""One-off seed: bulk-insert planned Study-mode sessions.

Reuses backend/database.py's get_conn() — same direct-Postgres connection
(DATABASE_URL from backend/.env) every backend router already uses, which
connects as the table owner and bypasses RLS. No Supabase client, no new
secret.

Idempotent on (date, name): a row is skipped if one with the same date and
title already exists, so running this twice never duplicates rows. There is
no user_id anywhere in this database (single-user app), so that's the full
dedupe key.

Usage:
    cd backend && venv/bin/python ../scripts/seed_study_sessions.py
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from database import get_conn  # noqa: E402

# mins is planned_duration_minutes; every row is a plan, so actual_duration_minutes
# stays NULL and sort_order stays NULL (matching how every other creation path in
# this app leaves sort_order unset until a drag-reorder happens).
ROWS = [
    ("2026-09-23", "study",  "PQC landscape: what is actually standardised", 60,
     "FIPS 203/204/205 final Aug 2024; FIPS 206 still draft; HQC as backup KEM. "
     "Output: algorithm to hard problem to use-case table."),
    ("2026-09-25", "study",  "Shor and Grover: what quantum really breaks", 60,
     "Shor kills RSA/DH/ECDH/ECDSA. Grover only square-roots search, so AES-256 survives. "
     "Be able to explain why."),
    ("2026-09-26", "create", "Write a one-page HNDL / Mosca note", 60,
     "Harvest-now-decrypt-later plus Mosca's inequality, applied to a SaaS platform with "
     "10-year data confidentiality."),
    ("2026-09-27", "review", "Week review", 20,
     "Sessions done? Next milestone on track? What gets cut next week?"),
    ("2026-09-28", "study",  "Lattice foundations: SVP/CVP, LWE, Ring/Module-LWE", 75,
     "Why structured variants exist: much smaller keys, extra algebraic structure. Peikert, "
     "A Decade of Lattice Cryptography (intro sections)."),
    ("2026-09-30", "study",  "FIPS 203 read-through: K-PKE, FO transform, parameters", 75,
     "Read the standard itself. K-PKE, Fujisaki-Okamoto to IND-CCA2, NTT over "
     "Z_q[X]/(X^256+1) with q=3329, implicit rejection."),
    ("2026-10-03", "create", "Trace ML-KEM-768 keygen/encaps/decaps by hand", 90,
     "Record real byte sizes for encaps key, decaps key and ciphertext. Compare with "
     "X25519's 32 bytes."),
    ("2026-10-04", "review", "Week review", 20,
     "Sessions done? Next milestone on track? What gets cut next week?"),
    ("2026-10-05", "study",  "FIPS 204: ML-DSA, Fiat-Shamir with Aborts", 75,
     "Why the rejection-sampling loop exists; hedged vs deterministic signing. The "
     "practical default signature."),
    ("2026-10-08", "study",  "FIPS 205 SLH-DSA + stateful LMS/XMSS (SP 800-208)", 90,
     "WOTS+, FORS, hypertree. Then LMS/XMSS for firmware signing and why statefulness is "
     "dangerous. Covers two families."),
    ("2026-10-10", "create", "Build the signature comparison table", 60,
     "Key size, sig size, sign/verify speed for Ed25519, ECDSA P-256, ML-DSA-65, "
     "SLH-DSA-128s, FN-DSA-512, plus where each is used. Cite sources."),
    ("2026-10-11", "review", "Week review", 20,
     "Sessions done? Next milestone on track? What gets cut next week?"),
    ("2026-10-12", "create", "Build liboqs + oqs-provider against OpenSSL 3.x", 90,
     "Goal: openssl list -kem-algorithms shows ML-KEM. Expect this to be fiddly."),
    ("2026-10-15", "create", "ML-DSA certs + hybrid X25519MLKEM768 handshake locally", 90,
     "ML-DSA CA and leaf, s_server and s_client, confirm the negotiated group. Note the "
     "chain size."),
    ("2026-10-17", "study",  "draft-ietf-tls-hybrid-design + Wireshark capture", 75,
     "Why hybrid rather than pure PQC. Then find the key share in your own ClientHello."),
    ("2026-10-18", "review", "Week review", 20,
     "Sessions done? Next milestone on track? What gets cut next week?"),
    ("2026-10-19", "study",  "NCSC 2028/2031/2035 timelines and NIST IR 8547", 60,
     "The UK frame every client and regulator references. Know the three milestones cold."),
    ("2026-10-22", "study",  "Cryptographic inventory and CBOM (CycloneDX, SP 1800-38)", 75,
     "What a CBOM must capture: algorithm, key length, where used, what depends on it. "
     "Discovery is step one of every migration."),
    ("2026-10-24", "create", "Script a crypto inventory over your k3s cluster", 90,
     "Enumerate TLS endpoints and certs, extract sig algorithm and key size, flag "
     "quantum-vulnerable, emit CycloneDX JSON. Homelab only."),
    ("2026-10-25", "review", "Week review", 20,
     "Sessions done? Next milestone on track? What gets cut next week?"),
    ("2026-10-26", "study",  "Crypto-agility in practice + CNSA 2.0", 60,
     "No hardcoded algorithm IDs, rotation that already works, negotiation over pinning. "
     "CNSA 2.0: AES-256, ML-KEM-1024, ML-DSA-87, LMS/XMSS."),
    ("2026-10-29", "create", "Benchmark: handshake latency and chain sizes", 90,
     "Classical vs hybrid X25519MLKEM768 vs pure PQC. Multiple runs; record the spread, "
     "not one number."),
    ("2026-10-31", "create", "Write up the benchmark: README, results, trade-offs", 90,
     "Method, results table, honest trade-offs: added latency, chain growth, where it "
     "would not be acceptable. Publish it."),
    ("2026-11-01", "review", "Six-week review and next block", 45,
     "What stuck, what did not, what block 2 should cover."),
]


def monday_of(iso_date_str):
    d = date.fromisoformat(iso_date_str)
    return d - timedelta(days=d.weekday())


def main():
    inserted, skipped = 0, 0
    with get_conn() as conn:
        for d, sport, name, mins, description in ROWS:
            existing = conn.execute(
                "SELECT id FROM study_sessions WHERE date = ? AND name = ?",
                (d, name),
            ).fetchone()
            if existing:
                skipped += 1
                continue
            conn.execute(
                """INSERT INTO study_sessions
                   (date, sport, name, description, planned_duration_minutes, actual_duration_minutes)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (d, sport, name, description, mins, None),
            )
            inserted += 1
        conn.commit()

    print(f"Inserted {inserted}, skipped {skipped} (already present).")
    print()

    by_week = {}
    total_minutes = 0
    for d, _sport, _name, mins, _desc in ROWS:
        wc = monday_of(d).isoformat()
        by_week.setdefault(wc, {"count": 0, "minutes": 0})
        by_week[wc]["count"] += 1
        by_week[wc]["minutes"] += mins
        total_minutes += mins

    print("Per week (week-commencing Monday):")
    for wc in sorted(by_week):
        row = by_week[wc]
        print(f"  {wc}: {row['count']} sessions, {row['minutes']} min ({row['minutes'] / 60:.2f}h)")

    print()
    print(f"Total: {len(ROWS)} rows, {total_minutes} planned minutes ({total_minutes / 60:.2f}h)")


if __name__ == "__main__":
    main()
