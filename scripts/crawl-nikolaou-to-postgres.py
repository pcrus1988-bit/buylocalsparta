#!/usr/bin/env python3
from __future__ import annotations

import json, os, re, time, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from urllib.parse import urljoin

import psycopg
import requests
from bs4 import BeautifulSoup

BASE = "https://www.nikolaoutools.gr/"
RUN_ID = os.environ.get("NIKOLAOU_CRAWL_RUN_ID", "nikolaou_master_20260823_001")
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
UA = "KONTA-MOU-catalogue-research/2.0 (+catalogue data quality; kontamou.site)"
HEADERS = {"User-Agent": UA, "Accept-Language": "el,en;q=0.8"}
TIMEOUT = 25
MAX_WORKERS = 16
MODEL_RE = re.compile(r"(?:Μοντέλο|MODEL|Model)\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,})", re.I)
CODE_RE = re.compile(r"(?:Κωδικός|CODE|Code)\s*:?\s*([0-9]{6,13})", re.I)
BARCODE_RE = re.compile(r"(?:Barcode|BARCODE)\s*:?\s*([0-9]{8,14})", re.I)
BRAND_RE = re.compile(r"(?:Μάρκα|Brand)\s*:?\s*([^\n|]{2,80})", re.I)
MODEL_TOKEN_RE = re.compile(r"\b(?:BBP|BVC|BSS|BHL|BEP|BPN|BDC|BLF|BHT|BDS|BAG|BWH|BWR|BCP|BSM|BGB|BPA|BPP|BFB|BHA|BHC|BHM|BPR|BRT|BWD|BWB|BEM|BGC|BGS|BHG|BHP|BHR|BHS|BHT|BID|BJS|BLC|BLG|BMC|BMF|BMG|BMX|BNA|BNT|BOC|BPC|BPH|BPL|BPM|BPN|BPS|BPT|BRA|BRB|BRC|BRM|BRO|BRP|BRT|BSB|BSC|BSD|BSG|BSH|BSM|BSS|BST|BSW|BTC|BTL|BTM|BTS|BVC|BWB|BWC|BWD|BWH|BWR|EC|PC|PS|ES|EB|GH|GB|GP|KB|KWP|GM|ATS|BG|EK|EP|PM|CA)[A-Z0-9-]{2,}\b", re.I)
SKIP = ("/media/", "/search/", "/blog/", "/news/", "/login", "/account", "/checkout", "/wishlist", "/compare", "/cart", "?", "#")


def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def get(url, retries=3):
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.7 + attempt * 1.2); continue
            return r
        except Exception as exc:
            last = exc; time.sleep(0.5 + attempt)
    raise last or RuntimeError("request failed")


def jsonld_products(soup):
    out=[]
    for tag in soup.find_all("script", attrs={"type":"application/ld+json"}):
        raw=tag.string or tag.get_text(" ", strip=True)
        if not raw: continue
        try: data=json.loads(raw)
        except Exception: continue
        queue=data if isinstance(data,list) else [data]
        i=0
        while i < len(queue):
            item=queue[i]; i+=1
            if isinstance(item,dict) and isinstance(item.get("@graph"),list): queue.extend(item["@graph"])
            if isinstance(item,dict) and str(item.get("@type","")).lower()=="product": out.append(item)
    return out


def content_node(soup):
    for selector in ("#content","main",".product-info",".product-page",".product-detail"):
        n=soup.select_one(selector)
        if n: return n
    return soup


def extract_specs(content):
    specs={}; bullets=[]
    for node in content.find_all(["li","tr","p","dt","dd"]):
        txt=clean(node.get_text(" ", strip=True))
        if not txt or len(txt)>900 or txt in bullets: continue
        bullets.append(txt)
        if node.name=="tr":
            cells=[clean(x.get_text(" ",strip=True)) for x in node.find_all(["th","td"])]
            if len(cells)>=2 and cells[0] and cells[1] and len(cells[0])<=120: specs.setdefault(cells[0], cells[1])
        elif ":" in txt:
            k,v=map(clean,txt.split(":",1))
            if 1<=len(k)<=120 and v and len(v)<=600: specs.setdefault(k,v)
    return specs, bullets


def extract_description(content,pj,title):
    if pj:
        d=clean(pj.get("description"))
        if len(d)>=40 and d.casefold()!=title.casefold(): return d[:5000]
    paras=[]
    stops=("σχετικά προϊόντα","copyright ©","δ.νικολάου","newsletter","λίστα επιθυμιών")
    metadata=("μοντέλο:","κωδικός:","barcode:","μάρκα:","σύγκρινέ το","οδηγίες χρήσης","σχεδιάγραμμα ανταλλακτικών")
    for p in content.find_all(["p","div"]):
        txt=clean(p.get_text(" ",strip=True))
        if not txt or len(txt)<35 or len(txt)>2000: continue
        low=txt.casefold()
        if any(x in low for x in stops) or any(low.startswith(x) for x in metadata) or txt==title or txt in paras: continue
        if len(txt.split())>=8 and ("." in txt or "," in txt or len(txt)>=100): paras.append(txt)
        if len(" ".join(paras))>3500: break
    return clean(" ".join(paras))[:5000]


def link_by_text(soup, needles):
    for a in soup.find_all("a", href=True):
        t=clean(a.get_text(" ",strip=True)).casefold(); h=a.get("href","")
        if any(n in t for n in needles) or any(n in h.casefold() for n in needles): return urljoin(BASE,h)
    return ""


def model_tokens(text):
    return sorted({m.upper() for m in MODEL_TOKEN_RE.findall(text or "")})

@dataclass
class Row:
    source_url:str; final_url:str=""; http_status:int=0; model:str=""; supplier_code:str=""; barcode:str=""; brand:str=""; title:str=""; supplier_description:str=""; specifications:dict=None; page_bullets:list=None; included_items:str=""; manual_url:str=""; spare_parts_url:str=""; image_url:str=""; related_models:list=None; compatibility_candidates:list=None; canonical_url:str=""; crawl_error:str=""
    def __post_init__(self):
        if self.specifications is None:self.specifications={}
        if self.page_bullets is None:self.page_bullets=[]
        if self.related_models is None:self.related_models=[]
        if self.compatibility_candidates is None:self.compatibility_candidates=[]


def parse(url):
    row=Row(url)
    try:
        r=get(url); row.http_status=r.status_code; row.final_url=r.url
        if r.status_code!=200 or "text/html" not in r.headers.get("content-type",""):
            row.crawl_error=f"status_or_type:{r.status_code}:{r.headers.get('content-type','')}"; return row
        soup=BeautifulSoup(r.text,"lxml"); content=content_node(soup); text=clean(content.get_text("\n",strip=True))
        products=jsonld_products(soup); pj=products[0] if products else None
        h1=soup.find("h1"); row.title=clean((pj or {}).get("name")) or clean(h1.get_text(" ",strip=True) if h1 else "")
        mm=MODEL_RE.search(text); cm=CODE_RE.search(text); bm=BARCODE_RE.search(text); br=BRAND_RE.search(text)
        row.model=clean((pj or {}).get("model") or (pj or {}).get("mpn")) if pj else ""
        if not row.model and mm: row.model=mm.group(1).strip().upper()
        row.supplier_code=clean((pj or {}).get("sku")) if pj else ""
        if not re.fullmatch(r"\d{6,13}",row.supplier_code or "") and cm: row.supplier_code=cm.group(1)
        row.barcode=clean((pj or {}).get("gtin13") or (pj or {}).get("gtin")) if pj else ""
        if not row.barcode and bm: row.barcode=bm.group(1)
        b=(pj or {}).get("brand") if pj else None
        row.brand=clean(b.get("name")) if isinstance(b,dict) else clean(b)
        if not row.brand and br: row.brand=clean(br.group(1))
        row.supplier_description=extract_description(content,pj,row.title)
        row.specifications,row.page_bullets=extract_specs(content); row.page_bullets=row.page_bullets[:150]
        inc=[]
        for btxt in row.page_bullets:
            if btxt.casefold().startswith("περιλαμβάνει:") and ":" in btxt: inc.append(clean(btxt.split(":",1)[1]))
        row.included_items=" | ".join(dict.fromkeys(inc))
        row.manual_url=link_by_text(soup,("οδηγίες χρήσης","manual","/manuals/")); row.spare_parts_url=link_by_text(soup,("σχεδιάγραμμα ανταλλακτικών","spare","ανταλλακ"))
        img=""
        if pj:
            ji=pj.get("image"); img=str(ji[0]) if isinstance(ji,list) and ji else str(ji or "")
        if not img:
            og=soup.find("meta",attrs={"property":"og:image"}); img=og.get("content","") if og else ""
        row.image_url=urljoin(BASE,img) if img else ""
        canon=soup.find("link",rel="canonical"); row.canonical_url=urljoin(BASE,canon.get("href","")) if canon else r.url
        allmods=model_tokens(text); row.related_models=[m for m in allmods if m.upper()!=row.model.upper()][:100]
        row.compatibility_candidates=model_tokens(row.supplier_description+" "+" ".join(row.page_bullets))[:100]
        if not pj and not (row.model and row.supplier_code): row.crawl_error="not_product_page"
    except Exception as exc: row.crawl_error=f"exception:{type(exc).__name__}:{exc}"[:600]
    return row


def parse_sitemap(blob):
    root=ET.fromstring(blob); locs=[clean(x.text) for x in root.iter() if x.tag.lower().endswith("loc") and x.text]
    return (locs,[]) if root.tag.lower().endswith("sitemapindex") else ([],locs)


def discover():
    queue=[urljoin(BASE,x) for x in ("sitemap.xml","sitemap_index.xml","sitemap-index.xml")]; seen=set(); pages=set()
    while queue:
        sm=queue.pop(0)
        if sm in seen: continue
        seen.add(sm)
        try:
            r=get(sm,retries=2)
            if r.status_code!=200: continue
            children,urls=parse_sitemap(r.content)
            queue.extend(x for x in children if x.startswith(BASE) and x not in seen)
            for u in urls:
                if u.startswith(BASE) and not any(bit in u for bit in SKIP): pages.add(u)
        except Exception as exc: print(f"NIKOLAOU_SITEMAP_WARN {sm} {type(exc).__name__}:{exc}", flush=True)
    return sorted(pages)

INSERT_SQL="""
insert into research_internal.nikolaou_crawl
(run_id,source_url,final_url,http_status,model,supplier_code,barcode,brand,title,supplier_description,specifications,page_bullets,included_items,manual_url,spare_parts_url,image_url,related_models,compatibility_candidates,canonical_url,crawl_error,crawled_at)
values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,now())
on conflict (run_id,source_url) do update set
final_url=excluded.final_url,http_status=excluded.http_status,model=excluded.model,supplier_code=excluded.supplier_code,barcode=excluded.barcode,brand=excluded.brand,title=excluded.title,supplier_description=excluded.supplier_description,specifications=excluded.specifications,page_bullets=excluded.page_bullets,included_items=excluded.included_items,manual_url=excluded.manual_url,spare_parts_url=excluded.spare_parts_url,image_url=excluded.image_url,related_models=excluded.related_models,compatibility_candidates=excluded.compatibility_candidates,canonical_url=excluded.canonical_url,crawl_error=excluded.crawl_error,crawled_at=now()
"""

def db_tuple(r):
    return (RUN_ID,r.source_url,r.final_url,r.http_status,r.model,r.supplier_code,r.barcode,r.brand,r.title,r.supplier_description,json.dumps(r.specifications,ensure_ascii=False),json.dumps(r.page_bullets,ensure_ascii=False),r.included_items,r.manual_url,r.spare_parts_url,r.image_url,json.dumps(r.related_models,ensure_ascii=False),json.dumps(r.compatibility_candidates,ensure_ascii=False),r.canonical_url,r.crawl_error)


def main():
    if not DATABASE_URL: raise SystemExit("DATABASE_URL/POSTGRES_URL missing")
    print(f"NIKOLAOU_CRAWL_START run={RUN_ID}",flush=True)
    urls=discover(); print(f"NIKOLAOU_DISCOVERED {len(urls)}",flush=True)
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("delete from research_internal.nikolaou_crawl where run_id=%s",(RUN_ID,))
            cur.execute("insert into research_internal.nikolaou_crawl_runs(run_id,status,discovered_count,crawled_count,valid_product_count,error_count,started_at,completed_at,notes) values(%s,'running',%s,0,0,0,now(),null,null) on conflict(run_id) do update set status='running',discovered_count=excluded.discovered_count,crawled_count=0,valid_product_count=0,error_count=0,started_at=now(),completed_at=null,notes=null",(RUN_ID,len(urls)))
        conn.commit()
        done=valid=errors=0; batch=[]
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futs={ex.submit(parse,u):u for u in urls}
            for fut in as_completed(futs):
                r=fut.result(); done+=1; valid+=int(not r.crawl_error and bool(r.model) and bool(r.supplier_code)); errors+=int(bool(r.crawl_error)); batch.append(db_tuple(r))
                if len(batch)>=80 or done==len(urls):
                    with conn.cursor() as cur:
                        cur.executemany(INSERT_SQL,batch)
                        cur.execute("update research_internal.nikolaou_crawl_runs set crawled_count=%s,valid_product_count=%s,error_count=%s where run_id=%s",(done,valid,errors,RUN_ID))
                    conn.commit(); batch.clear(); print(f"NIKOLAOU_PROGRESS {done}/{len(urls)} valid={valid} errors={errors}",flush=True)
        with conn.cursor() as cur:
            cur.execute("update research_internal.nikolaou_crawl_runs set status='completed',crawled_count=%s,valid_product_count=%s,error_count=%s,completed_at=now() where run_id=%s",(done,valid,errors,RUN_ID))
        conn.commit()
    print(f"NIKOLAOU_CRAWL_COMPLETE run={RUN_ID} discovered={len(urls)} valid={valid} errors={errors}",flush=True)

if __name__=='__main__': main()
