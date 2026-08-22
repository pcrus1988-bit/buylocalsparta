#!/usr/bin/env python3
from __future__ import annotations

import base64, gzip, importlib.util, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

import psycopg
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE_SCRIPT = ROOT / "scripts" / "crawl-nikolaou-to-postgres.py"
spec = importlib.util.spec_from_file_location("nikbase", BASE_SCRIPT)
nik = importlib.util.module_from_spec(spec)
sys.modules["nikbase"] = nik
assert spec and spec.loader
spec.loader.exec_module(nik)

RUN_ID = os.environ.get("NIKOLAOU_CRAWL_RUN_ID", "nikolaou_master_20260823_002")
RAW_DB = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
MAX_WORKERS = 12


def sanitized_db_url(raw: str) -> str:
    p = urlsplit(raw)
    # Vercel's Supabase integration may add routing metadata (e.g. `supa`)
    # that is not a libpq connection option. Preserve only libpq-supported URI params.
    allowed = {
        "sslmode", "connect_timeout", "application_name", "options",
        "target_session_attrs", "channel_binding", "sslrootcert", "sslcert",
        "sslkey", "sslpassword", "gssencmode", "keepalives",
        "keepalives_idle", "keepalives_interval", "keepalives_count",
    }
    query = urlencode([(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k in allowed])
    return urlunsplit((p.scheme, p.netloc, p.path, query, p.fragment))


def load_targets() -> list[dict[str, str]]:
    parts = []
    for name in (
        "nikolaou-model-code-targets-00.b64",
        "nikolaou-model-code-targets-01.b64",
    ):
        parts.append((ROOT / ".seed-transfer" / name).read_text(encoding="ascii").strip())
    payload = gzip.decompress(base64.b64decode("".join(parts)))
    rows = json.loads(payload.decode("utf-8"))
    out = []
    for row in rows:
        model = str(row.get("m") or "").strip().upper()
        code = str(row.get("c") or "").strip()
        if model or code:
            out.append({"model": model, "code": code})
    return out


def is_productish(url: str) -> bool:
    low = url.lower()
    return url.startswith(nik.BASE) and not any(bit in low for bit in nik.SKIP) and "/search/" not in low


def candidate_links(search_html: str, search_url: str, model: str, code: str) -> list[str]:
    soup = BeautifulSoup(search_html, "lxml")
    candidates: list[tuple[int, str]] = []
    mlow = model.lower()
    for a in soup.find_all("a", href=True):
        href = urljoin(search_url, a.get("href", ""))
        if not is_productish(href):
            continue
        text = nik.clean(a.get_text(" ", strip=True)).lower()
        hlow = href.lower()
        score = 0
        if mlow and mlow in hlow: score += 12
        if mlow and mlow in text: score += 10
        if code and code in hlow: score += 7
        if code and code in text: score += 7
        if re.search(r"-[A-Z0-9]{3,}/?$", href, re.I): score += 1
        if score:
            candidates.append((score, href))
    seen = set(); ordered = []
    for _, href in sorted(candidates, key=lambda x: (-x[0], len(x[1]))):
        if href not in seen:
            seen.add(href); ordered.append(href)
    return ordered[:8]


def resolve_and_parse(target: dict[str, str]):
    model, code = target["model"], target["code"]
    attempted: list[str] = []
    best = None
    for query in [q for q in (model, code) if q]:
        search_url = urljoin(nik.BASE, "search/" + quote(query, safe=""))
        try:
            r = nik.get(search_url, retries=3)
        except Exception as exc:
            attempted.append(f"search_exception:{query}:{type(exc).__name__}")
            continue
        # Some searches may redirect directly to a product page.
        urls = []
        if r.status_code == 200 and is_productish(r.url) and "/search/" not in r.url.lower():
            urls.append(r.url)
        if r.status_code == 200:
            urls.extend(candidate_links(r.text, r.url, model, code))
        if not urls:
            attempted.append(f"search_no_candidate:{query}:{r.status_code}")
            continue
        seen = set()
        for url in urls:
            if url in seen: continue
            seen.add(url)
            parsed = nik.parse(url)
            if best is None or (not parsed.crawl_error and parsed.model and parsed.supplier_code):
                best = parsed
            exact_model = bool(model) and parsed.model.upper() == model
            exact_code = bool(code) and parsed.supplier_code == code
            if exact_model and exact_code and not parsed.crawl_error:
                return parsed, ""
            if exact_model and not parsed.crawl_error:
                # Model is the stronger key when the supplier code is duplicated/revised.
                return parsed, ("supplier_code_mismatch:" + code + "->" + parsed.supplier_code) if code and parsed.supplier_code != code else ""
        attempted.append(f"candidate_mismatch:{query}")
    if best is not None:
        best.crawl_error = best.crawl_error or "target_identity_mismatch"
        return best, ";".join(attempted)
    unresolved = nik.Row(source_url=f"target://{model}/{code}")
    unresolved.model = model
    unresolved.supplier_code = code
    unresolved.crawl_error = "search_unresolved:" + ";".join(attempted)
    return unresolved, ""


INSERT_SQL = """
insert into research_internal.nikolaou_crawl
(run_id,target_model,target_supplier_code,source_url,final_url,http_status,model,supplier_code,barcode,brand,title,supplier_description,specifications,page_bullets,included_items,manual_url,spare_parts_url,image_url,related_models,compatibility_candidates,canonical_url,crawl_error,crawled_at)
values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,now())
on conflict (run_id,source_url) do update set
target_model=excluded.target_model,target_supplier_code=excluded.target_supplier_code,final_url=excluded.final_url,http_status=excluded.http_status,model=excluded.model,supplier_code=excluded.supplier_code,barcode=excluded.barcode,brand=excluded.brand,title=excluded.title,supplier_description=excluded.supplier_description,specifications=excluded.specifications,page_bullets=excluded.page_bullets,included_items=excluded.included_items,manual_url=excluded.manual_url,spare_parts_url=excluded.spare_parts_url,image_url=excluded.image_url,related_models=excluded.related_models,compatibility_candidates=excluded.compatibility_candidates,canonical_url=excluded.canonical_url,crawl_error=excluded.crawl_error,crawled_at=now()
"""


def db_tuple(target, row, resolver_note):
    err = row.crawl_error
    if resolver_note:
        err = (err + ";" if err else "") + resolver_note
    return (
        RUN_ID, target["model"], target["code"], row.source_url, row.final_url,
        row.http_status, row.model, row.supplier_code, row.barcode, row.brand,
        row.title, row.supplier_description,
        json.dumps(row.specifications, ensure_ascii=False),
        json.dumps(row.page_bullets, ensure_ascii=False),
        row.included_items, row.manual_url, row.spare_parts_url, row.image_url,
        json.dumps(row.related_models, ensure_ascii=False),
        json.dumps(row.compatibility_candidates, ensure_ascii=False),
        row.canonical_url, err,
    )


def main():
    if not RAW_DB:
        raise SystemExit("DATABASE_URL/POSTGRES_URL missing")
    db_url = sanitized_db_url(RAW_DB)
    targets = load_targets()
    print(f"NIKOLAOU_TARGET_CRAWL_START run={RUN_ID} targets={len(targets)}", flush=True)
    if len(targets) != 3165:
        raise SystemExit(f"expected 3165 targets, got {len(targets)}")
    with psycopg.connect(db_url, connect_timeout=20) as conn:
        with conn.cursor() as cur:
            cur.execute("delete from research_internal.nikolaou_crawl where run_id=%s", (RUN_ID,))
            cur.execute("""
                insert into research_internal.nikolaou_crawl_runs
                (run_id,status,discovered_count,crawled_count,valid_product_count,error_count,started_at,completed_at,notes)
                values(%s,'running',%s,0,0,0,now(),null,'exact master model+supplier-code target crawl')
                on conflict(run_id) do update set status='running',discovered_count=excluded.discovered_count,crawled_count=0,valid_product_count=0,error_count=0,started_at=now(),completed_at=null,notes=excluded.notes
            """, (RUN_ID, len(targets)))
        conn.commit()
        done = valid = errors = 0
        batch = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futs = {ex.submit(resolve_and_parse, t): t for t in targets}
            for fut in as_completed(futs):
                target = futs[fut]
                try:
                    row, note = fut.result()
                except Exception as exc:
                    row = nik.Row(source_url=f"target://{target['model']}/{target['code']}")
                    row.model = target["model"]; row.supplier_code = target["code"]
                    row.crawl_error = f"worker_exception:{type(exc).__name__}:{exc}"[:600]
                    note = ""
                done += 1
                exact = (not row.crawl_error and row.model.upper() == target["model"] and (not target["code"] or row.supplier_code == target["code"]))
                valid += int(exact)
                errors += int(bool(row.crawl_error) or not exact)
                batch.append(db_tuple(target, row, note))
                if len(batch) >= 50 or done == len(targets):
                    with conn.cursor() as cur:
                        cur.executemany(INSERT_SQL, batch)
                        cur.execute("update research_internal.nikolaou_crawl_runs set crawled_count=%s,valid_product_count=%s,error_count=%s where run_id=%s", (done, valid, errors, RUN_ID))
                    conn.commit(); batch.clear()
                    print(f"NIKOLAOU_PROGRESS {done}/{len(targets)} valid={valid} errors={errors}", flush=True)
        with conn.cursor() as cur:
            cur.execute("update research_internal.nikolaou_crawl_runs set status='completed',crawled_count=%s,valid_product_count=%s,error_count=%s,completed_at=now() where run_id=%s", (done, valid, errors, RUN_ID))
        conn.commit()
    print(f"NIKOLAOU_TARGET_CRAWL_COMPLETE run={RUN_ID} targets={len(targets)} valid={valid} errors={errors}", flush=True)


if __name__ == "__main__":
    main()
