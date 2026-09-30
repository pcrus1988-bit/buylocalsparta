import styles from "../../../components/AdminProductsControl.module.css";

export default function Loading(){
  return <main className="vendor-app admin-app">
    <section className="shell vendor-section">
      <div className={styles.routeLoading} aria-live="polite">
        <span className={styles.routeLoadingMark} aria-hidden="true"/>
        <div><strong>Opening Products &amp; Categories…</strong><small>The control surface loads before catalogue data.</small></div>
      </div>
    </section>
  </main>;
}
