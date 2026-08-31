import styles from "./ProductDetailSections.module.css";

export type ProductDetailRow = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

type ProductDetailSectionsProps = Readonly<{
  technicalRows: readonly ProductDetailRow[];
  packagingRows: readonly ProductDetailRow[];
}>;

function DetailRows({ rows }: { rows: readonly ProductDetailRow[] }) {
  return (
    <div className={styles.rows}>
      {rows.map((row) => (
        <div className={styles.row} key={row.key}>
          <strong>{row.label}</strong>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ title, rows }: { title: string; rows: readonly ProductDetailRow[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>{title}</div>
      <DetailRows rows={rows} />
    </section>
  );
}

function MobileAccordion({ title, rows }: { title: string; rows: readonly ProductDetailRow[] }) {
  return (
    <details className={styles.accordion}>
      <summary>{title}</summary>
      <div className={styles.accordionBody}>
        <DetailRows rows={rows} />
      </div>
    </details>
  );
}

export function ProductDetailSections({ technicalRows, packagingRows }: ProductDetailSectionsProps) {
  if (!technicalRows.length && !packagingRows.length) return null;

  return (
    <>
      <div className={`${styles.desktopGrid} ${packagingRows.length ? "" : styles.desktopGridSingle}`}>
        {technicalRows.length ? <DetailPanel title="Τεχνικές λεπτομέρειες" rows={technicalRows} /> : null}
        {packagingRows.length ? <DetailPanel title="Λεπτομέρειες συσκευασίας" rows={packagingRows} /> : null}
      </div>

      <div className={styles.mobileStack} aria-label="Λεπτομέρειες προϊόντος">
        {technicalRows.length ? <MobileAccordion title="Τεχνικές λεπτομέρειες" rows={technicalRows} /> : null}
        {packagingRows.length ? <MobileAccordion title="Λεπτομέρειες συσκευασίας" rows={packagingRows} /> : null}
      </div>
    </>
  );
}
