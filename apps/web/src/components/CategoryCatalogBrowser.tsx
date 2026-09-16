"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import { decodeCatalogSizeGroup, groupCatalogSizeFacets, inferCatalogSizeDomain } from "../lib/catalog-size";
import { CatalogProductCard } from "./CatalogProductCard";

const SHOWCASE_LIMIT = 10;
const FASHION_VENDOR_ID = "vendor_e8cb57b3c67b469d9a9d";

type FacetOption = Readonly<{ value: string; label: string; count: number }>;
type FashionAudience = "women" | "men" | "accessories";
type FashionFamily = "shoes" | "clothing" | "underwear" | "bags" | "jewellery" | "eyewear" | "accessories" | "other";
type FashionGroup = Readonly<{
  key: FashionFamily;
  label: string;
  helper: string;
  entries: readonly FacetOption[];
  count: number;
}>;

function normalized(value: string | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el");
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right, "el"));
}

function rank(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function showcase(products: readonly CatalogCard[], seed: string): readonly CatalogCard[] {
  return [...products].sort((left, right) => rank(`${seed}:${left.id}`) - rank(`${seed}:${right.id}`)).slice(0, SHOWCASE_LIMIT);
}

function audienceFor(entry: FacetOption): FashionAudience {
  const label = normalized(entry.label);
  if (label.includes("γυναικ")) return "women";
  if (label.includes("ανδρ")) return "men";
  return "accessories";
}

function familyFor(entry: FacetOption): FashionFamily {
  const label = normalized(entry.label);
  if (["sneaker", "παπουτ", "μποτ", "σανδαλ"].some((word) => label.includes(word))) return "shoes";
  if (["t-shirt", "t shirt", "αθλητικ", "κοστουμ", "μπουφαν", "παλτο", "παντελον", "jeans", "πλεκ", "πουκαμισ", "φουστ", "φορεμ", "top", "τοπ"].some((word) => label.includes(word))) return "clothing";
  if (["εσωρουχ", "μαγιο"].some((word) => label.includes(word))) return "underwear";
  if (["τσαντ", "σακιδ", "πορτοφολ", "αποσκευ", "θηκ"].some((word) => label.includes(word))) return "bags";
  if (["δαχτυλ", "κολιε", "σκουλαρ", "βραχιολ", "κοσμη"].some((word) => label.includes(word))) return "jewellery";
  if (["γυαλ", "σκελετ ορασ"].some((word) => label.includes(word))) return "eyewear";
  if (["ζων", "κασκολ", "καπελ", "γαντ"].some((word) => label.includes(word))) return "accessories";
  return "other";
}

const FAMILY_META: Readonly<Record<FashionFamily, Readonly<{ label: string; helper: string }>>> = {
  shoes: { label: "Παπούτσια", helper: "Sneakers, μπότες, επίσημα & σανδάλια" },
  clothing: { label: "Ρούχα", helper: "Καθημερινά, formal, παντελόνια, πλεκτά & άλλα" },
  underwear: { label: "Εσώρουχα & μαγιό", helper: "Εσώρουχα και swimwear" },
  bags: { label: "Τσάντες & αποσκευές", helper: "Τσάντες, σακίδια, πορτοφόλια & travel" },
  jewellery: { label: "Κοσμήματα", helper: "Δαχτυλίδια, κολιέ, σκουλαρίκια & βραχιόλια" },
  eyewear: { label: "Γυαλιά", helper: "Γυαλιά ηλίου & σκελετοί οράσεως" },
  accessories: { label: "Αξεσουάρ", helper: "Ζώνες, κασκόλ, καπέλα & γάντια" },
  other: { label: "Άλλα", helper: "Περισσότερες επιλογές μόδας" }
};

function buildGroups(entries: readonly FacetOption[]): readonly FashionGroup[] {
  const order: readonly FashionFamily[] = ["shoes", "clothing", "underwear", "bags", "jewellery", "eyewear", "accessories", "other"];
  return order.flatMap((key) => {
    const children = entries.filter((entry) => familyFor(entry) === key);
    return children.length ? [{ key, ...FAMILY_META[key], entries: children, count: children.reduce((sum, entry) => sum + entry.count, 0) }] : [];
  });
}

function audienceLabel(value: FashionAudience): string {
  return value === "women" ? "Γυναικεία" : value === "men" ? "Ανδρικά" : "Αξεσουάρ & τσάντες";
}

export function CategoryCatalogBrowser({ products, categoryName }: { products: readonly CatalogCard[]; categoryName: string }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [color, setColor] = useState("all");
  const [size, setSize] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isFashion = categoryName === "Μόδα & αξεσουάρ";
  const [guideOpen, setGuideOpen] = useState(isFashion);
  const [guideAudience, setGuideAudience] = useState<FashionAudience | null>(null);
  const [guideFamily, setGuideFamily] = useState<FashionFamily | null>(null);
  const [fashionFacets, setFashionFacets] = useState<readonly FacetOption[]>([]);
  const [fashionTotal, setFashionTotal] = useState(0);
  const [fashionLoading, setFashionLoading] = useState(isFashion);

  const brands = useMemo(() => unique(products.map((product) => product.brand)), [products]);
  const colors = useMemo(() => unique(products.map((product) => product.color)), [products]);
  const sizeDomain = useMemo(
    () => inferCatalogSizeDomain(products.flatMap((product) => [product.categoryCode, product.categoryLabel ?? ""])),
    [products]
  );
  const sizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      for (const raw of product.sizes) {
        const value = raw.trim();
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return groupCatalogSizeFacets(
      [...counts.entries()].map(([value, count]) => ({ value, count })),
      sizeDomain
    );
  }, [products, sizeDomain]);

  useEffect(() => {
    if (!isFashion) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/catalog/vendor/${FASHION_VENDOR_ID}?facets=1&facetsOnly=1`, { cache: "default" });
        if (!response.ok) throw new Error(`Fashion facets failed with ${response.status}`);
        const payload = await response.json() as { facets?: { total?: number; categories?: readonly FacetOption[] } };
        if (!cancelled) {
          setFashionFacets(payload.facets?.categories ?? []);
          setFashionTotal(payload.facets?.total ?? 0);
        }
      } catch (error) {
        console.error("Fashion guide facets failed", error);
      } finally {
        if (!cancelled) setFashionLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isFashion]);

  useEffect(() => {
    if (!guideOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setGuideOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [guideOpen]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    const selectedSizes = size === "all" ? [] : decodeCatalogSizeGroup(size);
    return products.filter((product) => {
      if (brand !== "all" && product.brand !== brand) return false;
      if (color !== "all" && product.color !== color) return false;
      if (selectedSizes.length && !product.sizes.some((raw) => selectedSizes.includes(raw.trim()))) return false;
      if (!needle) return true;
      return normalized([product.title, product.description, product.brand, product.color, product.mpn, product.gtin, ...product.sizes].filter(Boolean).join(" ")).includes(needle);
    });
  }, [brand, color, products, query, size]);

  const activeFilterCount = [brand, color, size].filter((value) => value !== "all").length;
  const filtering = Boolean(query) || activeFilterCount > 0;
  const visibleProducts = useMemo(() => filtering ? filtered : showcase(filtered, categoryName), [categoryName, filtered, filtering]);

  const clear = () => {
    setQuery("");
    setBrand("all");
    setColor("all");
    setSize("all");
    setFiltersOpen(false);
  };

  const restartGuide = () => {
    clear();
    setGuideAudience(null);
    setGuideFamily(null);
    setGuideOpen(true);
  };

  const audienceEntries = guideAudience ? fashionFacets.filter((entry) => audienceFor(entry) === guideAudience) : [];
  const groups = buildGroups(audienceEntries);
  const selectedGroup = guideFamily ? groups.find((group) => group.key === guideFamily) : undefined;
  const counts = useMemo(() => ({
    women: fashionFacets.filter((entry) => audienceFor(entry) === "women").reduce((sum, entry) => sum + entry.count, 0),
    men: fashionFacets.filter((entry) => audienceFor(entry) === "men").reduce((sum, entry) => sum + entry.count, 0),
    accessories: fashionFacets.filter((entry) => audienceFor(entry) === "accessories").reduce((sum, entry) => sum + entry.count, 0)
  }), [fashionFacets]);

  const openLeaf = (entry: FacetOption) => {
    const params = new URLSearchParams({ category: "fashion", subcategory: entry.value });
    window.location.assign(`/shop?${params.toString()}`);
  };

  const openGroup = (entries: readonly FacetOption[], label: string) => {
    const params = new URLSearchParams({ category: "fashion", guideLabel: label });
    for (const entry of entries) params.append("subcategory_any", entry.value);
    window.location.assign(`/shop?${params.toString()}`);
  };

  const guideBack = () => {
    if (guideFamily) setGuideFamily(null);
    else if (guideAudience) setGuideAudience(null);
    else setGuideOpen(false);
  };

  const audienceAllCount = audienceEntries.reduce((sum, entry) => sum + entry.count, 0);

  return <div className="categoryBrowser">
    {isFashion ? <div className="fashionCategoryGuideBar"><div><small>Προσωπικός οδηγός μόδας</small><strong>Δεν χρειάζεται να ψάξεις μέσα σε χιλιάδες προϊόντα.</strong></div><button type="button" onClick={restartGuide}>Τι ψάχνεις σήμερα; →</button></div> : null}

    <div className="categoryTools">
      <label className="categorySearch"><span>Αναζήτηση στην κατηγορία</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder={`Αναζήτηση σε ${categoryName}…`} /></label>
      <button className="categoryFilterToggle" type="button" aria-expanded={filtersOpen} aria-controls="category-filter-fields" onClick={() => setFiltersOpen((value) => !value)}>Φίλτρα{activeFilterCount ? ` · ${activeFilterCount}` : ""}<span aria-hidden="true">{filtersOpen ? "×" : "☰"}</span></button>
      <div id="category-filter-fields" className={`categoryFilterFields${filtersOpen ? " isOpen" : ""}`}>
        {isFashion ? <button className="guideInlineButton" type="button" onClick={restartGuide}>Οδηγός κατηγορίας</button> : null}
        {brands.length > 1 && <label><span>Μάρκα</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">Όλες</option>{brands.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        {colors.length > 1 && <label><span>Χρώμα</span><select value={color} onChange={(event) => setColor(event.target.value)}><option value="all">Όλα</option>{colors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        {sizes.length > 1 && <label><span>Μέγεθος</span><select value={size} onChange={(event) => setSize(event.target.value)}><option value="all">Όλα</option>{sizes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}{entry.count > 0 ? ` (${entry.count})` : ""}</option>)}</select></label>}
      </div>
    </div>

    <div className="categoryMeta"><span>{filtering ? <><strong>{filtered.length}</strong> αποτελέσματα στην κατηγορία.</> : <><strong>{Math.min(SHOWCASE_LIMIT, products.length)}</strong> επιλεγμένες επιλογές από {products.length} προϊόντα.</>}</span>{filtering ? <button type="button" onClick={clear}>Καθαρισμός</button> : null}</div>

    {visibleProducts.length ? <div className="categoryProductGrid">{visibleProducts.map((product, index) => <CatalogProductCard product={product} index={index} key={product.id} />)}</div> : <div className="empty-state category-empty-state"><div className="eyebrow">Δεν βρέθηκε αποτέλεσμα</div><h2>Δοκίμασε διαφορετική αναζήτηση.</h2><p>Τα φίλτρα αφορούν μόνο την τρέχουσα κατηγορία.</p><button className="button" type="button" onClick={clear}>Καθαρισμός</button></div>}

    {isFashion && guideOpen ? <div className="fashionGuide" role="dialog" aria-modal="true" aria-labelledby="category-fashion-guide-title">
      <div className="fashionGuideFrame">
        <header><div><strong>ΚΟΝΤΑ ΜΟΥ</strong><small>ΠΡΟΣΩΠΙΚΟΣ ΟΔΗΓΟΣ ΜΟΔΑΣ</small></div><button type="button" onClick={() => setGuideOpen(false)} aria-label="Κλείσιμο">×</button></header>
        <main>
          <div className="crumb">Μόδα{guideAudience ? ` / ${audienceLabel(guideAudience)}` : ""}{selectedGroup ? ` / ${selectedGroup.label}` : ""}</div>
          <div className="guideHeading"><p>ΛΙΓΟ ΠΙΟ ΕΥΚΟΛΑ</p><h2 id="category-fashion-guide-title">{selectedGroup ? selectedGroup.label : guideAudience ? audienceLabel(guideAudience) : "Τι ψάχνετε σήμερα;"}</h2><span>{selectedGroup ? "Διάλεξε μία ακριβή κατηγορία ή πάρε όλα τα προϊόντα αυτού του επιπέδου." : guideAudience ? "Διάλεξε ομάδα ή πάρε όλα τα προϊόντα αυτής της επιλογής." : "Σε κάθε βήμα μπορείς να σταματήσεις την καθοδήγηση και να δεις όλα όσα ανήκουν στην επιλογή σου."}</span></div>
          {fashionLoading ? <div className="guideLoading"><span /><strong>Οργανώνουμε τις επιλογές…</strong></div> : selectedGroup && guideAudience ? <div className="guideOptions leaf">
            <button className="all" type="button" onClick={() => openGroup(selectedGroup.entries, `${audienceLabel(guideAudience)} · ${selectedGroup.label}`)}><span><strong>Όλα τα {selectedGroup.label.toLocaleLowerCase("el")}</strong><small>Όλες οι επιλογές σε {audienceLabel(guideAudience).toLocaleLowerCase("el")} · {selectedGroup.label.toLocaleLowerCase("el")}</small></span><em>{selectedGroup.count}</em><b>→</b></button>
            {selectedGroup.entries.map((entry) => <button type="button" onClick={() => openLeaf(entry)} key={entry.value}><span><strong>{entry.label}</strong><small>Δες μόνο αυτή την κατηγορία</small></span><em>{entry.count}</em><b>→</b></button>)}
          </div> : guideAudience ? <div className="guideOptions">
            <button className="all" type="button" onClick={() => openGroup(audienceEntries, `Όλα τα ${audienceLabel(guideAudience).toLocaleLowerCase("el")}`)}><span><strong>Όλα τα {audienceLabel(guideAudience).toLocaleLowerCase("el")}</strong><small>Μην περιορίσεις άλλο αυτή την επιλογή</small></span><em>{audienceAllCount}</em><b>→</b></button>
            {groups.map((group) => <button type="button" onClick={() => setGuideFamily(group.key)} key={group.key}><span><strong>{group.label}</strong><small>{group.helper}</small></span><em>{group.count}</em><b>→</b></button>)}
          </div> : <div className="guideOptions audience">
            <button type="button" onClick={() => setGuideAudience("women")}><i>♀</i><span><strong>Γυναικεία</strong><small>Ρούχα, παπούτσια, τσάντες & άλλα</small></span><em>{counts.women}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("men")}><i>♂</i><span><strong>Ανδρικά</strong><small>Ρούχα, παπούτσια & άλλα</small></span><em>{counts.men}</em><b>→</b></button>
            <button type="button" onClick={() => setGuideAudience("accessories")}><i>◇</i><span><strong>Αξεσουάρ & τσάντες</strong><small>Κοσμήματα, γυαλιά, αποσκευές & αξεσουάρ</small></span><em>{counts.accessories}</em><b>→</b></button>
            <button className="all" type="button" onClick={() => setGuideOpen(false)}><i>∞</i><span><strong>Όλα τα προϊόντα</strong><small>Συνέχισε χωρίς επιπλέον καθοδήγηση</small></span><em>{fashionTotal || products.length}</em><b>→</b></button>
          </div>}
        </main>
        <footer><button type="button" onClick={guideBack}>{guideAudience ? "← Πίσω" : "Κλείσιμο"}</button>{guideAudience || guideFamily ? <button type="button" onClick={() => { setGuideAudience(null); setGuideFamily(null); }}>Από την αρχή</button> : null}<span>Σε κάθε επίπεδο υπάρχει επιλογή «Όλα».</span></footer>
      </div>
    </div> : null}

    <style jsx>{`
      .fashionCategoryGuideBar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 18px;padding:16px 18px;border:1px solid rgba(20,55,44,.14);border-radius:18px;background:#f4f0e8;color:#183027}.fashionCategoryGuideBar div{display:flex;flex-direction:column;gap:3px}.fashionCategoryGuideBar small{font-size:10px;font-weight:900;letter-spacing:.12em;color:#7b735f}.fashionCategoryGuideBar strong{font-size:15px}.fashionCategoryGuideBar button,.guideInlineButton{min-height:44px;border:0;border-radius:999px;background:#14372c;color:#fff;padding:0 18px;font:inherit;font-weight:850;cursor:pointer}.categoryTools{display:grid;grid-template-columns:minmax(260px,1.25fr) minmax(0,1.75fr);gap:10px;align-items:end;margin-bottom:16px}.categoryFilterFields{min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.categoryFilterFields:has(.guideInlineButton){grid-template-columns:auto repeat(3,minmax(0,1fr))}.guideInlineButton{align-self:end;white-space:nowrap}label{min-width:0;display:flex;flex-direction:column;gap:7px}label span{color:var(--ink-soft);font-size:12px;font-weight:800;letter-spacing:.04em}input,select{width:100%;min-height:48px;border:1px solid var(--line);border-radius:12px;background:var(--white);color:var(--ink);padding:0 14px;font:inherit}.categoryFilterToggle{display:none}.categoryMeta{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:0 0 22px;color:var(--ink-soft);font-size:13px}.categoryMeta button{min-height:40px;border:0;background:transparent;color:var(--ink);cursor:pointer;font:inherit;font-weight:900}.categoryProductGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.fashionGuide{position:fixed;inset:0;z-index:10000;background:#f4f0e8;color:#183027;overflow:auto}.fashionGuideFrame{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto}.fashionGuide header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;min-height:78px;padding:14px clamp(18px,5vw,66px);border-bottom:1px solid rgba(20,55,44,.12);background:rgba(244,240,232,.96);backdrop-filter:blur(12px)}.fashionGuide header div{display:flex;flex-direction:column}.fashionGuide header strong{font-size:18px}.fashionGuide header small{font-size:9px;letter-spacing:.16em;color:#737b76}.fashionGuide header button{width:48px;height:48px;border:1px solid rgba(20,55,44,.18);border-radius:50%;background:#fffaf1;color:#14372c;font-size:28px}.fashionGuide main{width:min(980px,100%);margin:0 auto;padding:clamp(25px,6vh,60px) 20px 35px}.crumb{margin-bottom:18px;font-size:12px;font-weight:800;color:#717a75}.guideHeading{max-width:760px;margin-bottom:28px}.guideHeading p{margin:0 0 8px;font-size:10px;font-weight:900;letter-spacing:.16em;color:#8a7650}.guideHeading h2{margin:0 0 10px;font-size:clamp(36px,7vw,62px);line-height:1;letter-spacing:-.045em;font-weight:500}.guideHeading span{display:block;max-width:700px;font-size:15px;line-height:1.55;color:#627069}.guideOptions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.guideOptions button{min-height:108px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;text-align:left;border:1px solid rgba(20,55,44,.15);border-radius:20px;background:#fffaf1;color:#183027;padding:20px;cursor:pointer}.guideOptions button>span{display:flex;flex-direction:column;gap:5px}.guideOptions strong{font-size:18px}.guideOptions small{font-size:12px;color:#6d756f}.guideOptions em{font-style:normal;font-size:13px;color:#6d756f}.guideOptions b{font-size:20px}.guideOptions.audience button{grid-template-columns:auto minmax(0,1fr) auto auto;min-height:128px}.guideOptions i{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#e9e5d9;font-style:normal;font-size:22px}.guideOptions button.all{background:#14372c;color:#fff}.guideOptions button.all small,.guideOptions button.all em{color:rgba(255,255,255,.7)}.guideOptions.leaf button{min-height:92px}.guideLoading{min-height:260px;display:grid;place-items:center;align-content:center;gap:12px}.guideLoading span{width:34px;height:34px;border:3px solid rgba(20,55,44,.15);border-top-color:#14372c;border-radius:50%;animation:guideSpin .8s linear infinite}.fashionGuide footer{position:sticky;bottom:0;display:flex;align-items:center;gap:10px;min-height:76px;padding:14px clamp(18px,5vw,66px);border-top:1px solid rgba(20,55,44,.12);background:rgba(244,240,232,.97);backdrop-filter:blur(12px)}.fashionGuide footer button{min-height:42px;padding:0 15px;border:1px solid rgba(20,55,44,.18);border-radius:999px;background:#fffaf1;color:#14372c;font:inherit;font-weight:800}.fashionGuide footer span{margin-left:auto;font-size:11px;color:#737b76}@keyframes guideSpin{to{transform:rotate(360deg)}}
      @media(max-width:980px){.categoryTools{grid-template-columns:1fr}.categoryFilterFields,.categoryFilterFields:has(.guideInlineButton){grid-template-columns:repeat(2,minmax(0,1fr))}.categoryProductGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.guideInlineButton{grid-column:1/-1}}
      @media(max-width:640px){.fashionCategoryGuideBar{align-items:flex-start;flex-direction:column}.fashionCategoryGuideBar button{width:100%}.categoryTools{grid-template-columns:minmax(0,1fr) auto}.categorySearch{grid-column:1/-1}.categoryFilterToggle{grid-column:1/-1;min-height:46px;display:inline-flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--white);color:var(--ink);font:inherit;font-size:14px;font-weight:900}.categoryFilterFields,.categoryFilterFields:has(.guideInlineButton){grid-column:1/-1;display:none;grid-template-columns:1fr 1fr;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--white)}.categoryFilterFields.isOpen{display:grid}input,select{font-size:16px}.categoryMeta{align-items:flex-start;flex-direction:column}.categoryProductGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fashionGuide header{min-height:70px;padding:11px 16px}.fashionGuide header button{width:44px;height:44px}.fashionGuide main{padding:24px 16px 26px}.guideHeading h2{font-size:42px}.guideHeading span{font-size:14px}.guideOptions{grid-template-columns:1fr}.guideOptions button,.guideOptions.audience button{min-height:94px;padding:16px;border-radius:17px}.guideOptions.audience button{grid-template-columns:auto minmax(0,1fr) auto auto}.guideOptions i{width:42px;height:42px}.fashionGuide footer{padding:12px 16px max(12px,env(safe-area-inset-bottom));flex-wrap:wrap}.fashionGuide footer span{display:none}}
      @media(max-width:360px){.categoryFilterFields,.categoryFilterFields:has(.guideInlineButton){grid-template-columns:1fr}.categoryProductGrid{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
