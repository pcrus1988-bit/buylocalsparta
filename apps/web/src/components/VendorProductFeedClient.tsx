"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorXmlFieldMapping } from "@buy-local-sparta/core";

type Category = { id: string; code: string; name: string; path?: string };
type PreviewError = { rowNumber: number; externalId?: string; field?: string; message: string };
type PreviewRow = {
  rowNumber: number;
  externalId: string;
  vendorSku?: string;
  title: string;
  brand?: string;
  gtin?: string;
  categoryCode: string;
  priceMinor: number;
  stockOnHand: number;
};
type Preview = {
  itemTag: string;
  fields: readonly string[];
  mapping: VendorXmlFieldMapping;
  sourceCategories: readonly string[];
  categories: readonly Category[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  sample: readonly PreviewRow[];
  errors: readonly PreviewError[];
};
type Feed = {
  id: string;
  name: string;
  sourceType: "url" | "upload";
  sourceUrl?: string;
  sourceFilename?: string;
  status: string;
  syncIntervalMinutes: number;
  fieldMapping: VendorXmlFieldMapping;
  categoryMapping: Record<string, string>;
  defaultCategoryCode?: string;
  productCount: number;
  readyCount: number;
  errorCount: number;
  lastSyncAt?: number;
  lastSuccessAt?: number;
  nextSyncAt?: number;
  lastError?: string;
};
type Run = {
  id: string;
  feedId: string;
  triggerType: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  validationErrors: readonly PreviewError[];
  createdSubmissions: number;
  updatedSubmissions: number;
  updatedOffers: number;
  protectedInventoryRows: number;
  missingRows: number;
  startedAt: number;
  finishedAt?: number;
};
type Workspace = { feeds: readonly Feed[]; recentRuns: readonly Run[] };

const fieldLabels: ReadonlyArray<[keyof VendorXmlFieldMapping, string]> = [
  ["externalId", "Κωδικός προϊόντος"],
  ["vendorSku", "SKU"],
  ["title", "Τίτλος"],
  ["description", "Περιγραφή"],
  ["brand", "Μάρκα"],
  ["model", "Μοντέλο"],
  ["mpn", "MPN"],
  ["gtin", "EAN / GTIN"],
  ["price", "Τελική τιμή πώλησης"],
  ["currency", "Νόμισμα"],
  ["stock", "Απόθεμα"],
  ["availability", "Διαθεσιμότητα"],
  ["categoryCode", "Κωδικός κατηγορίας ΚΟΝΤΑ ΜΟΥ"],
  ["sourceCategory", "Κατηγορία XML"],
  ["imageUrl", "Κύρια εικόνα"],
  ["additionalImageUrl", "Επιπλέον εικόνες"],
  ["productUrl", "Σύνδεσμος προϊόντος"],
  ["itemGroupId", "Ομάδα / κύριο προϊόν"],
  ["size", "Μέγεθος"],
  ["color", "Χρώμα"],
  ["condition", "Κατάσταση"]
];

const when = (value?: number) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

const kontaMouXmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <id>SKU-001</id>
    <title>Nike Air Max</title>
    <description>Περιγραφή προϊόντος</description>
    <ean>1234567890123</ean>
    <price>129.90</price>
    <currency>EUR</currency>
    <stock>8</stock>
    <brand>Nike</brand>
    <category>Shoes &gt; Sneakers</category>
    <image_link>https://example.gr/images/SKU-001.jpg</image_link>
    <additional_image_link>https://example.gr/images/SKU-001-2.jpg</additional_image_link>
    <link>https://example.gr/products/SKU-001</link>
    <item_group_id>STYLE-001</item_group_id>
    <size>42</size>
    <color>Black</color>
    <mpn>MODEL-001</mpn>
  </product>
</products>
`;

export function VendorProductFeedClient({
  csrfToken,
  categories,
  initial
}: {
  csrfToken: string;
  categories: readonly Category[];
  initial: Workspace;
}) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<"upload" | "url">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [xml, setXml] = useState("");
  const [filename, setFilename] = useState("");
  const [feedName, setFeedName] = useState("XML προϊόντων");
  const [interval, setInterval] = useState(360);
  const [mapping, setMapping] = useState<VendorXmlFieldMapping>({});
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [defaultCategoryCode, setDefaultCategoryCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const categoryByCode = useMemo(() => new Map(categories.map((item) => [item.code, item])), [categories]);
  const hasPendingUrlFeed = useMemo(
    () => initial.feeds.some((feed) => feed.sourceType === "url" && feed.status === "active" && !feed.lastSuccessAt),
    [initial.feeds]
  );

  useEffect(() => {
    if (!hasPendingUrlFeed) return;
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [hasPendingUrlFeed, router]);

  function payload(action: "preview" | "save") {
    return {
      action,
      sourceType,
      sourceUrl: sourceType === "url" ? sourceUrl : undefined,
      sourceFilename: sourceType === "upload" ? filename : undefined,
      feedName,
      syncIntervalMinutes: interval,
      xml: sourceType === "upload" ? xml : undefined,
      fieldMapping: mapping,
      categoryMapping,
      defaultCategoryCode: defaultCategoryCode || undefined
    };
  }

  async function request(body: unknown, key: string, method = "POST", url = "/api/vendor/catalog/feed") {
    setBusy(key);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body)
      });
      const data = await response.json() as { error?: string; preview?: Preview; feedId?: string };
      if (!response.ok) throw new Error(data.error ?? "Η ενέργεια δεν ολοκληρώθηκε.");
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια δεν ολοκληρώθηκε.");
      return undefined;
    } finally {
      setBusy("");
    }
  }

  function downloadKontaMouTemplate() {
    const blob = new Blob([kontaMouXmlTemplate], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kontamou-product-feed-template.xml";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function previewFeed() {
    if (sourceType === "upload" && !xml) {
      setError("Επίλεξε πρώτα ένα XML αρχείο.");
      return;
    }
    const data = await request(payload("preview"), "preview");
    if (!data?.preview) return;
    setPreview(data.preview);
    setMapping(data.preview.mapping);
    setSuccess("Το XML αναλύθηκε. Έλεγξε την αντιστοίχιση πεδίων και την προεπισκόπηση πριν την εισαγωγή.");
  }

  async function saveFeed() {
    if (!preview) {
      setError("Κάνε πρώτα προεπισκόπηση του XML.");
      return;
    }
    const data = await request(payload("save"), "save");
    if (!data) return;
    const queued = data.preview?.validRows ?? preview.validRows;
    setSuccess(sourceType === "url"
      ? `Η σύνδεση αποθηκεύτηκε. Ο πρώτος συγχρονισμός ξεκίνησε στο παρασκήνιο για ${queued.toLocaleString("el-GR")} έγκυρα προϊόντα και η κατάσταση θα ανανεωθεί αυτόματα.`
      : `Το XML αποθηκεύτηκε. ${queued.toLocaleString("el-GR")} έγκυρα προϊόντα μπήκαν για επεξεργασία και η αντιστοίχιση με τον κατάλογο συνεχίζεται αυτόματα.`);
    setPreview(null);
    router.refresh();
  }

  async function syncFeed(feedId: string) {
    const data = await request({ feedId }, "sync:" + feedId, "POST", "/api/vendor/catalog/feed/sync");
    if (!data) return;
    setSuccess("Ο συγχρονισμός ξεκίνησε στο παρασκήνιο. Μπορείς να παραμείνεις στη σελίδα — η κατάσταση θα ανανεωθεί αυτόματα.");
    router.refresh();
  }

  async function toggleFeed(feed: Feed) {
    const status = feed.status === "paused" ? "active" : "paused";
    const data = await request({ feedId: feed.id, status }, "status:" + feed.id, "PATCH");
    if (!data) return;
    setSuccess(status === "active" ? "Ο αυτόματος συγχρονισμός ενεργοποιήθηκε." : "Ο αυτόματος συγχρονισμός τέθηκε σε παύση.");
    router.refresh();
  }

  function editFeed(feed: Feed) {
    if (feed.sourceType !== "url" || !feed.sourceUrl) return;
    setSourceType("url");
    setSourceUrl(feed.sourceUrl);
    setFeedName(feed.name);
    setInterval(feed.syncIntervalMinutes);
    setMapping(feed.fieldMapping ?? {});
    setCategoryMapping(feed.categoryMapping ?? {});
    setDefaultCategoryCode(feed.defaultCategoryCode ?? "");
    setPreview(null);
    setError("");
    setSuccess("Οι αποθηκευμένες ρυθμίσεις φορτώθηκαν. Πάτησε «Ανάλυση & προεπισκόπηση» για ασφαλή νέα αντιστοίχιση.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setError("Επίλεξε αρχείο .xml.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Το ανέβασμα αρχείου υποστηρίζει έως 4 MB. Για μεγαλύτερο αρχείο χρησιμοποίησε σύνδεσμο XML.");
      return;
    }
    const content = await file.text();
    setFilename(file.name);
    setXml(content);
    setFeedName(file.name.replace(/\.xml$/i, "") || "XML προϊόντων");
    setPreview(null);
    setError("");
  }

  function changeMapping(key: keyof VendorXmlFieldMapping, value: string) {
    setMapping((current) => ({ ...current, [key]: value || undefined }));
    setPreview((current) => current ? { ...current, mapping: { ...current.mapping, [key]: value || undefined } } : current);
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>XML Feed:</strong> {error}</div>}
    {success && <div className="shell workspace-inline-note" role="status"><strong>Έτοιμο.</strong> {success}</div>}

    <section className="shell vendor-section">
      <div className="workspace-section-heading vendor-xml-section-heading">
        <div><div className="eyebrow">XML προϊόντων</div><h2>Σύνδεσε τον κατάλογό σου με XML</h2></div>
        <p>Ανέβασε ένα XML μία φορά ή σύνδεσε μόνιμο XML URL. Το ΚΟΝΤΑ ΜΟΥ αναγνωρίζει τα πεδία, ελέγχει τα προϊόντα και τα περνά στο υπάρχον canonical matching workflow.</p>
      </div>

      <div className="workspace-how-grid">
        <p><strong>Δεν δημιουργούμε διπλό κατάλογο:</strong> νέα προϊόντα περνούν από matching και approval, ενώ υπάρχοντα offers ενημερώνουν τιμή και stock.</p>
        <p><strong>Ασφαλές stock:</strong> ο συγχρονισμός δεν κατεβάζει φυσικό απόθεμα κάτω από ενεργές δεσμεύσεις παραγγελιών.</p>
        <p><strong>Σταθερή ταυτότητα:</strong> Κωδικός προϊόντος / SKU / GTIN κρατά το ίδιο προϊόν συνδεδεμένο σε κάθε επόμενο sync.</p>
      </div>

      <div className="workspace-action-bar" style={{ marginTop: 16 }}>
        <span><strong>KONTA MOU XML specification:</strong> χρησιμοποίησέ το για zero-mapping σύνδεση. Βασικά πεδία: ID, τίτλος, τιμή, stock και κατηγορία. Δεν είναι υποχρεωτικό — δεχόμαστε και custom / Google Merchant / e-shop feeds.</span>
        <button type="button" className="button button-secondary" onClick={downloadKontaMouTemplate}>Λήψη XML template</button>
      </div>

      <div className="workspace-tool-panel" style={{ marginTop: 18 }}>
        <div className="workspace-tool-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <button type="button" className={sourceType === "url" ? "button" : "button button-secondary"} onClick={() => { setSourceType("url"); setPreview(null); }}>Σύνδεση XML URL</button>
            <button type="button" className={sourceType === "upload" ? "button" : "button button-secondary"} onClick={() => { setSourceType("upload"); setPreview(null); }}>Upload XML</button>
          </div>

          <div className="workspace-form-grid">
            <label>
              <span>Όνομα feed</span>
              <input value={feedName} onChange={(event) => setFeedName(event.target.value)} maxLength={120} placeholder="π.χ. Κύριος κατάλογος e-shop" />
            </label>

            {sourceType === "url" ? <>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>XML URL</span>
                <input type="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setPreview(null); }} placeholder="https://eshop.gr/products.xml" />
              </label>
              <label>
                <span>Αυτόματος συγχρονισμός</span>
                <select value={interval} onChange={(event) => setInterval(Number(event.target.value))}>
                  <option value={60}>Κάθε 1 ώρα</option>
                  <option value={180}>Κάθε 3 ώρες</option>
                  <option value={360}>Κάθε 6 ώρες</option>
                  <option value={1440}>Κάθε ημέρα</option>
                </select>
              </label>
            </> : <label style={{ gridColumn: "1 / -1" }}>
              <span>XML αρχείο · έως 4 MB</span>
              <input type="file" accept=".xml,text/xml,application/xml" onChange={(event) => void chooseFile(event.target.files?.[0])} />
              {filename && <small>{filename}</small>}
            </label>}

            <label>
              <span>Προεπιλεγμένη κατηγορία</span>
              <select value={defaultCategoryCode} onChange={(event) => { setDefaultCategoryCode(event.target.value); setPreview(null); }}>
                <option value="">Αυτόματη αντιστοίχιση</option>
                {categories.map((category) => <option key={category.code} value={category.code}>{category.path ?? category.name} · {category.code}</option>)}
              </select>
            </label>
          </div>

          <div className="workspace-action-bar" style={{ marginTop: 18 }}>
            <span>Πρώτα κάνε έλεγχο. Τίποτα δεν εισάγεται πριν δεις τα αποτελέσματα.</span>
            <div className="workspace-action-buttons">
              <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void previewFeed()}>
                {busy === "preview" ? "Ανάλυση…" : "Ανάλυση & προεπισκόπηση"}
              </button>
              {preview && preview.validRows > 0 && <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void saveFeed()}>
                {busy === "save" ? "Εισαγωγή…" : sourceType === "url" ? "Σύνδεση & συγχρονισμός" : "Εισαγωγή προϊόντων"}
              </button>}
            </div>
          </div>
        </div>
      </div>
    </section>

    {preview && <section className="shell vendor-section">
      <div className="workspace-section-heading vendor-xml-section-heading">
        <div><div className="eyebrow">Προεπισκόπηση</div><h2>{preview.validRows.toLocaleString("el-GR")} έτοιμα από {preview.totalRows.toLocaleString("el-GR")}</h2></div>
        <p>Εντοπίστηκε επαναλαμβανόμενο element <strong>&lt;{preview.itemTag}&gt;</strong>. Τα πεδία παρακάτω μπορούν να διορθωθούν πριν την εισαγωγή.</p>
      </div>

      <div className="workspace-metric-strip">
        <div><small>Προϊόντα XML</small><strong>{preview.totalRows.toLocaleString("el-GR")}</strong></div>
        <div><small>Έτοιμα</small><strong>{preview.validRows.toLocaleString("el-GR")}</strong></div>
        <div><small>Με σφάλμα</small><strong>{preview.errorRows.toLocaleString("el-GR")}</strong></div>
        <div><small>Πεδία XML</small><strong>{preview.fields.length.toLocaleString("el-GR")}</strong></div>
      </div>

      <details className="workspace-tool-panel" open>
        <summary><span><strong>Field mapping</strong><small>Το ΚΟΝΤΑ ΜΟΥ έκανε αυτόματη αναγνώριση. Άλλαξε μόνο ό,τι χρειάζεται.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-form-grid">
            {fieldLabels.map(([key, label]) => <label key={key}>
              <span>{label}</span>
              <select value={mapping[key] ?? ""} onChange={(event) => changeMapping(key, event.target.value)}>
                <option value="">— Δεν χρησιμοποιείται —</option>
                {preview.fields.map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
            </label>)}
          </div>
          <div className="workspace-action-bar" style={{ marginTop: 16 }}>
            <span>Μετά από αλλαγή mapping, τρέξε ξανά την προεπισκόπηση για νέο validation.</span>
            <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void previewFeed()}>Επανέλεγχος</button>
          </div>
        </div>
      </details>

      {preview.sourceCategories.length > 0 && <details className="workspace-tool-panel">
        <summary><span><strong>Αντιστοίχιση κατηγοριών XML</strong><small>{preview.sourceCategories.length} διαφορετικές κατηγορίες βρέθηκαν στο feed.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-compact-list">
            {preview.sourceCategories.slice(0, 50).map((source) => <div className="workspace-compact-row" key={source}>
              <strong>{source}</strong>
              <select
                value={categoryMapping[source] ?? ""}
                onChange={(event) => setCategoryMapping((current) => ({ ...current, [source]: event.target.value }))}
                style={{ minWidth: 260 }}
              >
                <option value="">Αυτόματο / default</option>
                {categories.map((category) => <option key={category.code} value={category.code}>{category.path ?? category.name}</option>)}
              </select>
            </div>)}
          </div>
          {preview.sourceCategories.length > 50 && <small>Εμφανίζονται οι πρώτες 50 κατηγορίες. Οι υπόλοιπες θα χρησιμοποιήσουν αυτόματο matching ή την προεπιλεγμένη κατηγορία.</small>}
          <div className="workspace-action-bar" style={{ marginTop: 16 }}>
            <span>Αποθήκευσε τα mappings με το feed ή τρέξε νέο validation πριν τη σύνδεση.</span>
            <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void previewFeed()}>Έλεγχος mappings</button>
          </div>
        </div>
      </details>}

      {preview.errors.length > 0 && <details className="workspace-tool-panel" open>
        <summary><span><strong>Προβλήματα που βρέθηκαν</strong><small>Τα μη έγκυρα rows δεν θα εισαχθούν.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-compact-list">
            {preview.errors.slice(0, 40).map((item, index) => <div className="workspace-compact-row" key={String(item.rowNumber) + ":" + index}>
              <strong>Row {item.rowNumber}{item.externalId ? " · " + item.externalId : ""}</strong>
              <span>{item.field ? item.field + ": " : ""}{item.message}</span>
            </div>)}
          </div>
        </div>
      </details>}

      <details className="workspace-tool-panel">
        <summary><span><strong>Δείγμα προϊόντων</strong><small>Έλεγχος των πρώτων έγκυρων γραμμών μετά το mapping.</small></span></summary>
        <div className="workspace-tool-body" style={{ overflowX: "auto" }}>
          <table className="workspace-table">
            <thead><tr><th>ID</th><th>Προϊόν</th><th>Κατηγορία</th><th>Τιμή</th><th>Stock</th></tr></thead>
            <tbody>{preview.sample.slice(0, 20).map((row) => <tr key={row.externalId}>
              <td>{row.externalId}</td>
              <td><strong>{row.title}</strong><small style={{ display: "block" }}>{[row.brand, row.vendorSku, row.gtin].filter(Boolean).join(" · ")}</small></td>
              <td>{categoryByCode.get(row.categoryCode)?.name ?? row.categoryCode}</td>
              <td>{euro(row.priceMinor)}</td>
              <td>{row.stockOnHand}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>}

    <section className="shell vendor-section">
      <div className="workspace-section-heading vendor-xml-section-heading">
        <div><div className="eyebrow">Συνδεδεμένα XML</div><h2>XML συνδέσεις & συγχρονισμοί</h2></div>
        <p>Τα URL feeds μπορούν να παγώσουν ή να συγχρονιστούν άμεσα. Τα αρχεία που ανεβαίνουν παραμένουν στο ιστορικό ως εφάπαξ εισαγωγές.</p>
      </div>

      {initial.feeds.length === 0 ? <div className="workspace-inline-note">Δεν έχει συνδεθεί ακόμη XML feed.</div> : <div className="workspace-queue-list">
        {initial.feeds.map((feed) => <article className="workspace-queue-card" key={feed.id}>
          <div className="workspace-queue-head">
            <div><strong>{feed.name}</strong><small>{feed.sourceType === "url" ? feed.sourceUrl : feed.sourceFilename}</small></div>
            <span className="status-pill">{feed.sourceType === "url" && !feed.lastSuccessAt ? "Σε ουρά" : feed.status}</span>
          </div>
          <div className="workspace-queue-primary">
            {feed.sourceType === "url" && !feed.lastSuccessAt
              ? <span>Αναμονή πρώτου συγχρονισμού</span>
              : <span>{feed.readyCount.toLocaleString("el-GR")} έτοιμα</span>}
            <span>{feed.errorCount.toLocaleString("el-GR")} σφάλματα</span>
            <span>Τελευταίο sync: {when(feed.lastSyncAt)}</span>
            {feed.sourceType === "url" && <span>Επόμενο: {feed.status === "paused" ? "σε παύση" : when(feed.nextSyncAt)}</span>}
          </div>
          {feed.lastError && <div className="workspace-inline-note">{feed.lastError}</div>}
          {feed.sourceType === "url" && <div className="workspace-action-bar">
            <span>Κάθε {feed.syncIntervalMinutes === 60 ? "1 ώρα" : feed.syncIntervalMinutes === 180 ? "3 ώρες" : feed.syncIntervalMinutes === 360 ? "6 ώρες" : "ημέρα"}</span>
            <div className="workspace-action-buttons">
              <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void syncFeed(feed.id)}>
                {busy === "sync:" + feed.id ? "Συγχρονισμός…" : "Συγχρονισμός τώρα"}
              </button>
              <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => editFeed(feed)}>
                Αντιστοίχιση πεδίων
              </button>
              <button type="button" className="button button-ghost" disabled={Boolean(busy)} onClick={() => void toggleFeed(feed)}>
                {feed.status === "paused" ? "Ενεργοποίηση" : "Παύση"}
              </button>
            </div>
          </div>}
        </article>)}
      </div>}

      {initial.recentRuns.length > 0 && <details className="workspace-tool-panel" style={{ marginTop: 18 }}>
        <summary><span><strong>Ιστορικό sync</strong><small>Οι 30 πιο πρόσφατες εκτελέσεις.</small></span></summary>
        <div className="workspace-tool-body">
          <div className="workspace-compact-list">
            {initial.recentRuns.map((run) => <div className="workspace-compact-row" key={run.id}>
              <div>
                <strong>{when(run.startedAt)} · {run.triggerType === "scheduled" ? "αυτόματος" : run.triggerType === "manual" ? "χειροκίνητος" : "εισαγωγή"} · {run.status === "completed" ? "ολοκληρώθηκε" : run.status === "partial" ? "μερικώς ολοκληρωμένος" : run.status === "failed" ? "απέτυχε" : run.status}</strong>
                {run.validationErrors.length > 0 && <details style={{ marginTop: 6 }}>
                  <summary>Προβολή {run.validationErrors.length.toLocaleString("el-GR")} σφάλματα ελέγχου</summary>
                  <div className="workspace-compact-list" style={{ marginTop: 8 }}>
                    {run.validationErrors.slice(0, 40).map((item,index) => <div className="workspace-compact-row" key={run.id + ":" + index}>
                      <strong>Row {item.rowNumber}{item.externalId ? " · " + item.externalId : ""}</strong>
                      <span>{item.field ? item.field + ": " : ""}{item.message}</span>
                    </div>)}
                  </div>
                </details>}
              </div>
              <span>{run.validRows}/{run.totalRows} έγκυρα · {run.createdSubmissions} νέα · {run.updatedOffers} ενημερωμένες προσφορές · {run.errorRows} σφάλματα</span>
            </div>)}
          </div>
        </div>
      </details>}
    </section>
  </>;
}
