import type { HomepagePromoCta } from "../lib/homepage-promo-cta-runtime";
import styles from "./HomeRegistrationCta.module.css";

export function HomeRegistrationCta({ cta }: { cta: HomepagePromoCta }) {
  return (
    <section className={`${styles.section} shell`} aria-labelledby="homepage-registration-cta-title">
      <div className={styles.card}>
        <span className={styles.heartMark} aria-hidden="true">♡</span>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>{cta.eyebrow}</div>
          <h2 id="homepage-registration-cta-title">{cta.headline}</h2>
          {cta.body ? <p>{cta.body}</p> : null}
        </div>
        <div className={styles.actionArea}>
          <a className={styles.button} href={cta.linkUrl}>
            <span>{cta.buttonLabel}</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </a>
          {cta.supportingText ? <small>{cta.supportingText}</small> : null}
        </div>
      </div>
    </section>
  );
}
