#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = "https://www.nikolaoutools.gr/"
OUT_DIR = Path("artifacts/nikolaou-crawl")
OUT_DIR.mkdir(parents=True, exist_ok=True)
UA = "KONTA-MOU-catalogue-research/1.0 (+catalogue data quality; contact via kontamou.site)"
HEADERS = {"User-Agent": UA, "Accept-Language": "el,en;q=0.8"}
TIMEOUT = 25
MAX_WORKERS = 10

MODEL_RE = re.compile(r"(?:Μοντέλο|MODEL|Model)\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,})", re.I)
CODE_RE = re.compile(r"(?:Κωδικός|CODE|Code)\s*:?\s*([0-9]{6,13})", re.I)
BARCODE_RE = re.compile(r"(?:Barcode|BARCODE)\s*:?\s*([0-9]{8,14})", re.I)
BRAND_RE = re.compile(r"(?:Μάρκα|Brand)\s*:?\s*([^\n|]{2,80})", re.I)
MODEL_TOKEN_RE = re.compile(r"\b(?:BBP|BVC|BSS|BHL|BEP|BPN|BDC|BLF|BHT|BDS|BAG|BWH|BWR|BCP|BSM|BGB|EC|PC|PS|ES|EB|GH|GB|GP|KB|KWP|GM|ATS|BG|EK|EP|KB|PM|CA)[A-Z0-9-]{2,}\b", re.I)

SKIP_URL_BITS = (
    "/media/", "/search/", "/blog/", "/news/", "/login", "/account", "/checkout", "/wishlist",
    "/compare", "/cart", "?", "#"
)

session = requests.Session()
session.headers.update(HEADERS)


def get(url: str, *, retries: int = 3) -> requests.Response:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(1.0 + attempt * 1.5)
                continue
            return r
        except Exception as exc:
            last = exc
            time.sleep(0.8 + attempt * 1.2)
    if last:
        raise last
    raise RuntimeError("request failed")


def clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def jsonld_products(soup: BeautifulSoup) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = tag.string or tag.get_text(" ", strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        queue = data if isinstance(data, list) else [data]
        for item in queue:
            if isinstance(item, dict) and "@graph" in item and isinstance(item["@graph"], list):
                queue.extend(item["@graph"])
            if isinstance(item, dict) and str(item.get("@type", "")).lower() == "product":
                out.append(item)
    return out


def extract_specs(content: BeautifulSoup) -> tuple[dict[str, str], list[str]]:
    specs: dict[str, str] = {}
    bullets: list[str] = []
    for node in content.find_all(["li", "tr", "p"]):
        txt = clean(node.get_text(" ", strip=True))
        if not txt or len(txt) > 800:
            continue
        if txt in bullets:
            continue
        bullets.append(txt)
        if ":" in txt:
            k, v = txt.split(":", 1)
            k, v = clean(k), clean(v)
            if 1 <= len(k) <= 100 and v and len(v) <= 500:
                specs.setdefault(k, v)
        elif node.name == "tr":
            cells = [clean(x.get_text(" ", strip=True)) for x in node.find_all(["th", "td"])]
            if len(cells) >= 2 and cells[0] and cells[1]:
                specs.setdefault(cells[0], cells[1])
    return specs, bullets


def extract_description(content: BeautifulSoup, product_json: dict[str, Any] | None, title: str) -> str:
    if product_json:
        d = clean(str(product_json.get("description") or ""))
        if len(d) >= 40 and d.lower() != title.lower():
            return d
    paras: list[str] = []
    stop_words = ("σχετικά προϊόντα", "copyright ©", "δ.νικολάου", "newsletter")
    metadata = ("μοντέλο:", "κωδικός:", "barcode:", "μάρκα:", "σύγκρινέ το", "οδηγίες χρήσης", "σχεδιάγραμμα ανταλλακτικών")
    for p in content.find_all(["p", "div"]):
        txt = clean(p.get_text(" ", strip=True))
        if not txt or len(txt) < 30 or len(txt) > 1800:
            continue
        low = txt.lower()
        if any(x in low for x in stop_words):
            continue
        if any(low.startswith(x) for x in metadata):
            continue
        if txt == title or txt in paras:
            continue
        # Prefer prose, not menu/category dumps.
        if len(txt.split()) >= 8 and ("." in txt or "," in txt or len(txt) >= 100):
            paras.append(txt)
        if len(" ".join(paras)) > 2200:
            break
    return clean(" ".join(paras))[:4000]


def choose_content(soup: BeautifulSoup) -> BeautifulSoup:
    for selector in ("#content", "main", ".product-info", ".product-page", ".product-detail"):
        node = soup.select_one(selector)
        if node:
            return node
    return soup


def link_by_text(soup: BeautifulSoup, needles: tuple[str, ...]) -> str:
    for a in soup.find_all("a", href=True):
        txt = clean(a.get_text(" ", strip=True)).lower()
        href = a.get("href", "")
        if any(n in txt for n in needles) or any(n in href.lower() for n in needles):
            return urljoin(BASE, href)
    return ""


def compatibility_candidates(text: str) -> list[str]:
    hits = {m.upper() for m in MODEL_TOKEN_RE.findall(text)}
    return sorted(hits)


def related_models_from_content(content: BeautifulSoup, current: str) -> list[str]:
    text = clean(content.get_text("\n", strip=True))
    models = compatibility_candidates(text)
    return [m for m in models if m.upper() != current.upper()][:80]


@dataclass
class ProductRow:
    source_url: str
    final_url: str = ""
    http_status: int = 0
    model: str = ""
    supplier_code: str = ""
    barcode: str = ""
    brand: str = ""
    title: str = ""
    supplier_description: str = ""
    specifications_json: str = "{}"
    page_bullets_json: str = "[]"
    included_items: str = ""
    manual_url: str = ""
    spare_parts_url: str = ""
    image_url: str = ""
    related_models_json: str = "[]"
    compatibility_candidates_json: str = "[]"
    canonical_url: str = ""
    crawl_error: str = ""


def parse_product(url: str) -> ProductRow:
    row = ProductRow(source_url=url)
    try:
        r = get(url)
        row.http_status = r.status_code
        row.final_url = r.url
        if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
            row.crawl_error = f"status_or_type:{r.status_code}:{r.headers.get('content-type','')}"
            return row
        soup = BeautifulSoup(r.text, "lxml")
        content = choose_content(soup)
        text = clean(content.get_text("\n", strip=True))
        products = jsonld_products(soup)
        pj = products[0] if products else None
        h1 = soup.find("h1")
        row.title = clean((pj or {}).get("name") if pj else "") or clean(h1.get_text(" ", strip=True) if h1 else "")
        mm = MODEL_RE.search(text)
        cm = CODE_RE.search(text)
        bm = BARCODE_RE.search(text)
        br = BRAND_RE.search(text)
        row.model = clean(str((pj or {}).get("model") or (pj or {}).get("mpn") or "")) if pj else ""
        if not row.model and mm:
            row.model = mm.group(1).strip().upper()
        row.supplier_code = clean(str((pj or {}).get("sku") or "")) if pj else ""
        if not re.fullmatch(r"\d{6,13}", row.supplier_code or "") and cm:
            row.supplier_code = cm.group(1)
        row.barcode = clean(str((pj or {}).get("gtin13") or (pj or {}).get("gtin") or "")) if pj else ""
        if not row.barcode and bm:
            row.barcode = bm.group(1)
        brand_obj = (pj or {}).get("brand") if pj else None
        if isinstance(brand_obj, dict):
            row.brand = clean(str(brand_obj.get("name") or ""))
        elif brand_obj:
            row.brand = clean(str(brand_obj))
        if not row.brand and br:
            row.brand = clean(br.group(1))
        row.supplier_description = extract_description(content, pj, row.title)
        specs, bullets = extract_specs(content)
        row.specifications_json = json.dumps(specs, ensure_ascii=False, sort_keys=True)
        row.page_bullets_json = json.dumps(bullets[:120], ensure_ascii=False)
        inc = [b.split(":",1)[1].strip() for b in bullets if b.lower().startswith("περιλαμβάνει:") and ":" in b]
        row.included_items = " | ".join(dict.fromkeys(inc))
        row.manual_url = link_by_text(soup, ("οδηγίες χρήσης", "manual", "/manuals/"))
        row.spare_parts_url = link_by_text(soup, ("σχεδιάγραμμα ανταλλακτικών", "spare", "ανταλλακ"))
        img = ""
        if pj:
            ji = pj.get("image")
            if isinstance(ji, list) and ji:
                img = str(ji[0])
            elif ji:
                img = str(ji)
        if not img:
            og = soup.find("meta", attrs={"property":"og:image"})
            img = og.get("content", "") if og else ""
        row.image_url = urljoin(BASE, img) if img else ""
        canon = soup.find("link", rel="canonical")
        row.canonical_url = urljoin(BASE, canon.get("href", "")) if canon else r.url
        rel = related_models_from_content(content, row.model)
        row.related_models_json = json.dumps(rel, ensure_ascii=False)
        focus = row.supplier_description + " " + " ".join(bullets)
        row.compatibility_candidates_json = json.dumps(compatibility_candidates(focus), ensure_ascii=False)
        # Reject category/list pages. A valid product page must expose at least model + code or Product JSON-LD.
        if not pj and not (row.model and row.supplier_code):
            row.crawl_error = "not_product_page"
        return row
    except Exception as exc:
        row.crawl_error = f"exception:{type(exc).__name__}:{exc}"[:600]
        return row


def parse_sitemap_xml(xml: bytes) -> tuple[list[str], list[str]]:
    root = ET.fromstring(xml)
    tag = root.tag.lower()
    locs = [clean(x.text) for x in root.iter() if x.tag.lower().endswith("loc") and x.text]
    if tag.endswith("sitemapindex"):
        return locs, []
    return [], locs


def discover_urls() -> list[str]:
    roots = [
        urljoin(BASE, "sitemap.xml"),
        urljoin(BASE, "sitemap_index.xml"),
        urljoin(BASE, "sitemap-index.xml"),
    ]
    seen_sitemaps: set[str] = set()
    pages: set[str] = set()
    queue = roots[:]
    while queue:
        sm = queue.pop(0)
        if sm in seen_sitemaps:
            continue
        seen_sitemaps.add(sm)
        try:
            r = get(sm, retries=2)
            if r.status_code != 200:
                continue
            children, urls = parse_sitemap_xml(r.content)
            queue.extend(x for x in children if x.startswith(BASE) and x not in seen_sitemaps)
            for u in urls:
                if not u.startswith(BASE):
                    continue
                if any(bit in u for bit in SKIP_URL_BITS):
                    continue
                pages.add(u)
        except Exception:
            continue
    # Fallback: harvest internal links from brand/category landing pages when sitemap discovery is incomplete.
    if len(pages) < 1000:
        for seed in (BASE, urljoin(BASE,"bormann/"), urljoin(BASE,"nakayama/"), urljoin(BASE,"kumatsugen-%CE%B3%CE%B5%CE%BD%CE%BD%CE%AE%CF%84%CF%81%CE%B9%CE%B5%CF%82/")):
            try:
                r = get(seed)
                soup = BeautifulSoup(r.text, "lxml")
                for a in soup.find_all("a", href=True):
                    u = urljoin(BASE, a["href"])
                    if u.startswith(BASE) and not any(bit in u for bit in SKIP_URL_BITS):
                        pages.add(u)
            except Exception:
                pass
    return sorted(pages)


def write(rows: list[ProductRow]) -> None:
    all_path = OUT_DIR / "nikolaou-crawl-all.csv"
    good_path = OUT_DIR / "nikolaou-products-crawled.csv"
    jsonl_path = OUT_DIR / "nikolaou-products-crawled.jsonl"
    fields = list(ProductRow.__dataclass_fields__.keys())
    with all_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(asdict(r) for r in rows)
    good = [r for r in rows if not r.crawl_error and r.model and r.supplier_code]
    with good_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(asdict(r) for r in good)
    with jsonl_path.open("w", encoding="utf-8") as f:
        for r in good:
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")
    summary = {
        "discovered_urls": len(rows),
        "valid_product_pages": len(good),
        "with_description": sum(bool(r.supplier_description) for r in good),
        "with_specs": sum(r.specifications_json not in ("", "{}") for r in good),
        "with_manual": sum(bool(r.manual_url) for r in good),
        "with_spare_parts": sum(bool(r.spare_parts_url) for r in good),
        "errors": sum(bool(r.crawl_error) for r in rows),
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


def main() -> int:
    urls = discover_urls()
    print(f"discovered {len(urls)} candidate URLs", flush=True)
    rows: list[ProductRow] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(parse_product, u): u for u in urls}
        for i, fut in enumerate(as_completed(futs), start=1):
            rows.append(fut.result())
            if i % 250 == 0:
                print(f"crawled {i}/{len(urls)}", flush=True)
    rows.sort(key=lambda r: (r.supplier_code, r.model, r.source_url))
    write(rows)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
