import styles from "../../../../components/AdminProductsControl.module.css";

export default function Loading(){
  return <main className="vendor-app admin-app"><section className="shell vendor-section"><div className={styles.routeLoading} aria-live="polite"><span className={styles.routeLoadingMark} aria-hidden="true"/><div><strong>Opening Enrichment QA…</strong><small>The review queue is bounded; evidence details load only for the selected record.</small></div></div></section></main>;
}
