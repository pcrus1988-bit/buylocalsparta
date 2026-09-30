"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { VendorStorefrontSettings, VendorStorefrontWorkspace } from "../lib/vendor-storefront-settings";
import styles from "./VendorTrial.module.css";

export function VendorStorefrontBuilder(props: {
  initial: VendorStorefrontWorkspace;
  csrfToken: string;
  productCount?: number;
}) {
  const [shortDescription, setShortDescription] = useState(props.initial.shortDescription);
  const [story, setStory] = useState(props.initial.story);
  const [settings, setSettings] = useState<VendorStorefrontSettings>(props.initial.settings);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const heroClass = useMemo(() => {
    if (settings.heroStyle === "centered") return `${styles.storeHero} ${styles.storeHeroCentered}`;
    if (settings.heroStyle === "editorial") return `${styles.storeHero} ${styles.storeHeroEditorial}`;
    return styles.storeHero;
  }, [settings.heroStyle]);

  function patchSettings(patch: Partial<VendorStorefrontSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setMessage("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vendor/storefront-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": props.csrfToken },
        body: JSON.stringify({ shortDescription, story, settings })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Δεν αποθηκεύτηκαν οι αλλαγές.");
      setMessage("Αποθηκεύτηκε. Η ιδιωτική προεπισκόπηση ενημερώθηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν αποθηκεύτηκαν οι αλλαγές.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.builder} aria-label="Storefront Builder">
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <div><div className="eyebrow">Storefront Builder</div><h2>Κάν’ το δικό σου</h2></div>
        <button className={styles.saveButton} type="button" onClick={save} disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLegend}>Χρώμα καταστήματος</span>
        <div className={styles.colorRow}>
          <input aria-label="Χρώμα καταστήματος" type="color" value={settings.accentColor} onChange={(event) => patchSettings({ accentColor: event.target.value })} />
          <input aria-label="HEX χρώμα" type="text" value={settings.accentColor} maxLength={7} onChange={(event) => patchSettings({ accentColor: /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) ? event.target.value : settings.accentColor })} />
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLegend}>Στυλ Hero</span>
        <div className={styles.segmented}>
          {([
            ["split", "Δυναμικό"],
            ["centered", "Κεντρικό"],
            ["editorial", "Editorial"]
          ] as const).map(([value, label]) => <button key={value} type="button" className={`${styles.segment} ${settings.heroStyle === value ? styles.segmentActive : ""}`} onClick={() => patchSettings({ heroStyle: value })}>{label}</button>)}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="trial-hero-title">Κεντρικός τίτλος</label>
        <input id="trial-hero-title" type="text" maxLength={100} value={settings.heroTitle} placeholder={props.initial.vendorName} onChange={(event) => patchSettings({ heroTitle: event.target.value })} />
      </div>

      <div className={styles.field}>
        <label htmlFor="trial-short-description">Σύντομη περιγραφή</label>
        <textarea id="trial-short-description" maxLength={320} value={shortDescription} placeholder="Τι κάνει ξεχωριστό το κατάστημά σου;" onChange={(event) => setShortDescription(event.target.value)} />
      </div>

      <div className={styles.field}>
        <label htmlFor="trial-story">Η ιστορία του καταστήματος</label>
        <textarea id="trial-story" maxLength={5000} value={story} placeholder="Πες στους πελάτες ποιοι είστε, τι γνωρίζετε και πώς μπορείτε να τους βοηθήσετε." onChange={(event) => setStory(event.target.value)} />
      </div>

      <span className={styles.fieldLegend}>Ενότητες storefront</span>
      <div className={styles.toggles}>
        {([
          ["showFeatured", "Προτεινόμενα προϊόντα"],
          ["showFlashSale", "Flash Sale"],
          ["showBazaar", "BAZAAR · δεύτερη ζωή"],
          ["showAbout", "Σχετικά με εμάς"],
          ["showLocation", "Τοποθεσία"],
          ["showContact", "Επικοινωνία"]
        ] as const).map(([key, label]) => <label className={styles.toggle} key={key}><span>{label}</span><input type="checkbox" checked={settings[key]} onChange={(event) => patchSettings({ [key]: event.target.checked } as Partial<VendorStorefrontSettings>)} /></label>)}
      </div>

      {message && <p className={`${styles.status} ${styles.ok}`} role="status">{message}</p>}
      {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
      <p className={styles.miniNote}>Οι αλλαγές του trial αποθηκεύονται στο πραγματικό μελλοντικό storefront σου. Δεν δημοσιεύονται δημόσια πριν ολοκληρωθεί η ενεργοποίηση συνεργάτη.</p>
    </div>

    <div className={styles.previewPanel}>
      <div className={styles.previewToolbar}>
        <div><strong>Ζωντανή ιδιωτική προεπισκόπηση</strong><br/><small>Αυτό βλέπεις μόνο εσύ στο trial.</small></div>
        <div className={styles.deviceToggle}>
          <button type="button" className={`${styles.deviceButton} ${device === "desktop" ? styles.deviceActive : ""}`} onClick={() => setDevice("desktop")}>Desktop</button>
          <button type="button" className={`${styles.deviceButton} ${device === "mobile" ? styles.deviceActive : ""}`} onClick={() => setDevice("mobile")}>Mobile</button>
        </div>
      </div>

      <div className={`${styles.previewFrame} ${device === "mobile" ? styles.mobileFrame : ""}`} style={{ "--accent": settings.accentColor } as CSSProperties}>
        <div className={heroClass}>
          <div className={styles.storeEyebrow}>ΚΟΝΤΑ ΜΟΥ · {props.initial.location?.locality ?? "Τοπικό κατάστημα"}</div>
          <h3>{settings.heroTitle || props.initial.vendorName}</h3>
          <p>{shortDescription || "Πρόσθεσε μία σύντομη περιγραφή για να καταλάβει αμέσως ο πελάτης τι προσφέρει το κατάστημά σου."}</p>
        </div>
        <div className={styles.storeBody}>
          <div className={styles.chips}><span className={styles.chip}>Παραλαβή από κατάστημα</span><span className={styles.chip}>Τοπική υποστήριξη</span><span className={styles.demoPill}>TRIAL PREVIEW</span></div>
          {settings.showFeatured && <>
            <h4>Προτεινόμενα προϊόντα</h4>
            <div className={styles.productGrid}>{[1,2,3].map((item) => <div className={styles.productCard} key={item}><div className={styles.productImage}>◇</div><div className={styles.productMeta}><strong>{props.productCount ? `Προϊόν ${item}` : "Demo προϊόν"}</strong><small>{props.productCount ? "Από τον κατάλογό σου" : "Δείγμα έως ότου προσθέσεις προϊόντα"}</small></div></div>)}</div>
          </>}
          {settings.showFlashSale && <div className={styles.sectionBlock}><h4>⚡ Flash Sale</h4><p>Μία γρήγορη, παιχνιδοποιημένη προσφορά μπορεί να εμφανίζεται εδώ όταν την ενεργοποιήσεις.</p></div>}
          {settings.showBazaar && <div className={styles.sectionBlock}><h4>♻ BAZAAR</h4><p>Επιστροφές και επιλεγμένα είδη μπορούν να αποκτούν δεύτερη ζωή αντί να γίνονται απόβλητα.</p></div>}
          {settings.showAbout && <div className={styles.sectionBlock}><h4>Η ιστορία μας</h4><p>{story || "Η ιστορία, η εμπειρία και οι άνθρωποι πίσω από το κατάστημά σου θα εμφανίζονται εδώ."}</p></div>}
          {settings.showLocation && props.initial.location && <div className={styles.sectionBlock}><h4>Βρες μας</h4><p>{props.initial.location.addressLine1}, {props.initial.location.postcode} {props.initial.location.locality}</p></div>}
          {settings.showContact && <div className={styles.sectionBlock}><h4>Ρώτησε το κατάστημα</h4><p>Ο πελάτης μπορεί να ζητήσει τοπική συμβουλή και βοήθεια πριν αγοράσει.</p></div>}
        </div>
      </div>
    </div>
  </section>;
}
