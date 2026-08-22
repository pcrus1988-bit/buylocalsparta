import type { ContentBlock, ContentLocale, ContentTranslation } from "@buy-local-sparta/core";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

function text(data: Readonly<Record<string, unknown>>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.trim();
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") && !/[\r\n]/.test(href)) return href;
  if (/^https:\/\//i.test(href)) return href;
  return undefined;
}

function recordList(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function paragraphList(data: Readonly<Record<string, unknown>>): readonly string[] {
  const explicit = data.paragraphs;
  if (Array.isArray(explicit)) return explicit.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  const body = text(data, "body", "text", "description", "copy");
  return body ? body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean) : [];
}

function ActionLink({ href, label, secondary = false }: { href?: string; label?: string; secondary?: boolean }) {
  if (!href || !label) return null;
  return <a className={secondary ? "button button-secondary" : "button button-light"} href={href}>{label}</a>;
}

function HeroBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const heading = text(data, "heading", "title") ?? "ΚΟΝΤΑ ΜΟΥ Sparta";
  const eyebrow = text(data, "eyebrow", "kicker");
  const body = text(data, "body", "description", "text");
  const primaryHref = safeHref(data.primaryHref ?? data.href);
  const primaryLabel = text(data, "primaryLabel", "ctaLabel", "buttonLabel");
  const secondaryHref = safeHref(data.secondaryHref);
  const secondaryLabel = text(data, "secondaryLabel");
  return <section className="content-hero"><div className="shell content-hero-grid"><div>
    {eyebrow && <div className="eyebrow light">{eyebrow}</div>}
    <h1>{heading}</h1>
    {body && <p>{body}</p>}
    {(primaryHref || secondaryHref) && <div className="hero-actions"><ActionLink href={primaryHref} label={primaryLabel ?? "Περισσότερα"} /><ActionLink href={secondaryHref} label={secondaryLabel} secondary /></div>}
  </div></div></section>;
}

function RichTextBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const heading = text(data, "heading", "title");
  const eyebrow = text(data, "eyebrow", "kicker");
  const paragraphs = paragraphList(data);
  return <section className="shell content-section"><article className="content-copy">
    {eyebrow && <div className="eyebrow">{eyebrow}</div>}
    {heading && <h2>{heading}</h2>}
    {paragraphs.map((paragraph, index) => <p key={`${block.id}-${index}`}>{paragraph}</p>)}
  </article></section>;
}

function GridBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const items = recordList(data.items ?? data.categories ?? data.links);
  const heading = text(data, "heading", "title");
  const eyebrow = text(data, "eyebrow", "kicker");
  return <section className="shell content-section">
    {(heading || eyebrow) && <div className="content-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}{heading && <h2>{heading}</h2>}</div></div>}
    <div className="destination-grid">{items.map((item, index) => {
      const label = text(item, "label", "title", "name") ?? `Επιλογή ${index + 1}`;
      const description = text(item, "description", "body", "text");
      const href = safeHref(item.href) ?? "/shop";
      return <a href={href} key={`${block.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong>{description && <small>{description}</small>}</a>;
    })}</div>
  </section>;
}

function FaqBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const items = recordList(data.items ?? data.questions);
  const heading = text(data, "heading", "title") ?? "Συχνές ερωτήσεις";
  return <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">FAQ</div><h2>{heading}</h2></div></div>
    <div className="process-list">{items.map((item, index) => {
      const question = text(item, "question", "title") ?? `Ερώτηση ${index + 1}`;
      const answer = text(item, "answer", "body", "text") ?? "";
      return <article key={`${block.id}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{question}</h3><p>{answer}</p></div></article>;
    })}</div>
  </section>;
}

function CtaBlock({ block, locale }: { block: ContentBlock; locale: ContentLocale }) {
  const data = block.data;
  const heading = text(data, "heading", "title") ?? (block.type === "ask_local_cta" ? "Ρώτησε τοπικά" : "Χρειάζεσαι βοήθεια;");
  const body = text(data, "body", "description", "text");
  const defaultHref = block.type === "ask_local_cta" ? "/ask-local" : block.type === "advice_cta" ? "/advice" : `/${locale}`;
  const href = safeHref(data.href ?? data.primaryHref) ?? defaultHref;
  const label = text(data, "label", "ctaLabel", "primaryLabel") ?? (block.type === "ask_local_cta" ? "Ask Local" : "Δες περισσότερα");
  return <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">ΚΟΝΤΑ ΜΟΥ</div><h2>{heading}</h2>{body && <p>{body}</p>}<div className="hero-actions"><a className="button button-light" href={href}>{label}</a></div></div></div></section>;
}

function StoryBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const heading = text(data, "heading", "title");
  const body = text(data, "body", "text", "description", "excerpt");
  const href = safeHref(data.href);
  return <section className="shell content-section"><article className="content-copy">
    <div className="eyebrow">Τοπική ιστορία</div>
    {heading && <h2>{heading}</h2>}
    {body && <p>{body}</p>}
    {href && <p><a className="button button-secondary" href={href}>{text(data, "label", "ctaLabel") ?? "Διάβασε περισσότερα"}</a></p>}
  </article></section>;
}

function CollectionBlock({ block, locale }: { block: ContentBlock; locale: ContentLocale }) {
  const data = block.data;
  const heading = text(data, "heading", "title") ?? "Επιλεγμένα προϊόντα";
  const body = text(data, "body", "description", "text");
  const slug = text(data, "collectionSlug", "slug");
  const href = safeHref(data.href) ?? (slug ? `/${locale}/collections/${encodeURIComponent(slug)}` : "/shop");
  return <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Collection</div><h2>{heading}</h2></div>{body && <p>{body}</p>}</div><a className="button button-secondary" href={href}>{text(data, "label", "ctaLabel") ?? "Δες τη συλλογή"}</a></section>;
}

function GenericTrustBlock({ block }: { block: ContentBlock }) {
  const data = block.data;
  const heading = text(data, "heading", "title");
  const body = text(data, "body", "description", "text");
  const items = recordList(data.items ?? data.facts);
  return <section className="shell content-section">
    {(heading || body) && <div className="content-heading"><div><div className="eyebrow">ΚΟΝΤΑ ΜΟΥ</div>{heading && <h2>{heading}</h2>}</div>{body && <p>{body}</p>}</div>}
    {items.length > 0 && <div className="content-fact-list">{items.map((item, index) => <div key={`${block.id}-${index}`}><strong>{text(item, "title", "label", "name") ?? `#${index + 1}`}</strong><span>{text(item, "description", "body", "text") ?? ""}</span></div>)}</div>}
  </section>;
}

function RenderBlock({ block, locale }: { block: ContentBlock; locale: ContentLocale }) {
  if (block.type === "hero") return <HeroBlock block={block} />;
  if (block.type === "rich_text") return <RichTextBlock block={block} />;
  if (block.type === "category_grid") return <GridBlock block={block} />;
  if (block.type === "faq") return <FaqBlock block={block} />;
  if (block.type === "advice_cta" || block.type === "ask_local_cta") return <CtaBlock block={block} locale={locale} />;
  if (block.type === "shop_story" || block.type === "merchant_spotlight") return <StoryBlock block={block} />;
  if (block.type === "product_collection") return <CollectionBlock block={block} locale={locale} />;
  return <GenericTrustBlock block={block} />;
}

export function CmsContentRenderer({ translation, locale }: { translation: ContentTranslation; locale: ContentLocale }) {
  return <main>
    <SiteHeader />
    {translation.blocks.length === 0
      ? <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">ΚΟΝΤΑ ΜΟΥ Sparta</div><h1>{translation.title}</h1></div></div></section>
      : translation.blocks.map((block) => <RenderBlock block={block} locale={locale} key={block.id} />)}
    <SiteFooter />
  </main>;
}
