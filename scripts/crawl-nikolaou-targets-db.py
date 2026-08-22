#!/usr/bin/env python3
from __future__ import annotations

import base64, gzip, importlib.util, json, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
TARGET_SCRIPT = ROOT / "scripts" / "crawl-nikolaou-targets.py"
spec = importlib.util.spec_from_file_location("niktarget", TARGET_SCRIPT)
mod = importlib.util.module_from_spec(spec)
sys.modules["niktarget"] = mod
assert spec and spec.loader
spec.loader.exec_module(mod)

RUN_ID = os.environ.get("NIKOLAOU_CRAWL_RUN_ID", "nikolaou_master_20260823_003")
MANIFEST_ID = "master_3165_20260823"
RAW_DB = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
MAX_WORKERS = 12


def load_targets_from_db(conn) -> list[dict[str, str]]:
    with conn.cursor() as cur:
        cur.execute("select payload from research_internal.nikolaou_target_chunks where manifest_id=%s order by chunk_no", (MANIFEST_ID,))
        chunks = [row[0] for row in cur.fetchall()]
    if len(chunks) != 9:
        raise RuntimeError(f"expected 9 manifest chunks, got {len(chunks)}")
    joined = "".join(chunks)
    if len(joined) != 25804:
        raise RuntimeError(f"manifest length mismatch: {len(joined)}")
    payload = gzip.decompress(base64.b64decode(joined))
    rows = json.loads(payload.decode("utf-8"))
    targets = [{"model": str(r.get("m") or "").strip().upper(), "code": str(r.get("c") or "").strip()} for r in rows]
    if len(targets) != 3165:
        raise RuntimeError(f"expected 3165 targets, got {len(targets)}")
    return targets


def main():
    if not RAW_DB:
        raise SystemExit("DATABASE_URL/POSTGRES_URL missing")
    db_url = mod.sanitized_db_url(RAW_DB)
    with psycopg.connect(db_url, connect_timeout=20) as conn:
        targets = load_targets_from_db(conn)
        print(f"NIKOLAOU_TARGET_CRAWL_START run={RUN_ID} targets={len(targets)} manifest={MANIFEST_ID}", flush=True)
        with conn.cursor() as cur:
            cur.execute("delete from research_internal.nikolaou_crawl where run_id=%s", (RUN_ID,))
            cur.execute("""
                insert into research_internal.nikolaou_crawl_runs
                (run_id,status,discovered_count,crawled_count,valid_product_count,error_count,started_at,completed_at,notes)
                values(%s,'running',3165,0,0,0,now(),null,%s)
                on conflict(run_id) do update set status='running',discovered_count=3165,crawled_count=0,valid_product_count=0,error_count=0,started_at=now(),completed_at=null,notes=excluded.notes
            """, (RUN_ID, f"checksum-verified exact master target crawl; manifest={MANIFEST_ID}"))
        conn.commit()
        done = valid = errors = 0
        batch = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futs = {ex.submit(mod.resolve_and_parse, target): target for target in targets}
            for fut in as_completed(futs):
                target = futs[fut]
                try:
                    row, note = fut.result()
                except Exception as exc:
                    row = mod.nik.Row(source_url=f"target://{target['model']}/{target['code']}")
                    row.model = target["model"]
                    row.supplier_code = target["code"]
                    row.crawl_error = f"worker_exception:{type(exc).__name__}:{exc}"[:600]
                    note = ""
                done += 1
                exact = (not row.crawl_error and row.model.upper() == target["model"] and (not target["code"] or row.supplier_code == target["code"]))
                valid += int(exact)
                errors += int(bool(row.crawl_error) or not exact)
                old_run = mod.RUN_ID
                mod.RUN_ID = RUN_ID
                batch.append(mod.db_tuple(target, row, note))
                mod.RUN_ID = old_run
                if len(batch) >= 50 or done == len(targets):
                    with conn.cursor() as cur:
                        cur.executemany(mod.INSERT_SQL, batch)
                        cur.execute("update research_internal.nikolaou_crawl_runs set crawled_count=%s,valid_product_count=%s,error_count=%s where run_id=%s", (done, valid, errors, RUN_ID))
                    conn.commit()
                    batch.clear()
                    print(f"NIKOLAOU_PROGRESS {done}/3165 valid={valid} errors={errors}", flush=True)
        with conn.cursor() as cur:
            cur.execute("update research_internal.nikolaou_crawl_runs set status='completed',crawled_count=%s,valid_product_count=%s,error_count=%s,completed_at=now() where run_id=%s", (done, valid, errors, RUN_ID))
        conn.commit()
        print(f"NIKOLAOU_TARGET_CRAWL_COMPLETE run={RUN_ID} targets=3165 valid={valid} errors={errors}", flush=True)


if __name__ == "__main__":
    main()
