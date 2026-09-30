import styles from "../../../components/AdminProductsControl.module.css";

export default function Loading(){
  return <section className="shell vendor-section"><div className={styles.routeLoading} aria-live="polite"><span className={styles.routeLoadingMark} aria-hidden="true"/><div><strong>Opening Supplier PIM…</strong><small>The Admin shell stays interactive while this workspace loads.</small></div></div></section>;
}
