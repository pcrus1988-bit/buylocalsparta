import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOURCE = "https://www.polo.gr";
const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "el-GR,el;q=0.9,en-US;q=0.7,en;q=0.6",
  referer: `${SOURCE}/`
};

function summary(body: string) {
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  const productLinks = [...body.matchAll(/href=["']([^"']*\/product\/[^"'#?]+\/?)["']/gi)].map((match) => match[1]);
  const text = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  return { title, productLinks: [...new Set(productLinks)].slice(0, 20), productLinkCount: new Set(productLinks).size, textPreview: text.slice(0, 400) };
}

async function probe(url: string) {
  try {
    const response = await fetch(url, { headers, redirect: "follow", cache: "no-store" });
    const body = await response.text();
    return { requestedUrl: url, finalUrl: response.url, status: response.status, contentType: response.headers.get("content-type"), bytes: body.length, ...summary(body) };
  } catch (error) {
    return { requestedUrl: url, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET() {
  const results = await Promise.all([
    probe(`${SOURCE}/shop/`),
    probe(`${SOURCE}/wp-json/wc/store/v1/products?per_page=5&page=1`),
    probe(`${SOURCE}/product/sakidio-squad-l/`)
  ]);
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), results }, { headers: { "cache-control": "private, no-store" } });
}
