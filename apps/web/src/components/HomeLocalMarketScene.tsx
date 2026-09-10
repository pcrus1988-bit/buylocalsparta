import type { HomepageLocalMarketScene as HomepageLocalMarketSceneContent } from "../lib/homepage-local-market-runtime";
import styles from "./HomeLocalMarketScene.module.css";

export function HomeLocalMarketScene({ scene }: { scene: HomepageLocalMarketSceneContent }) {
  if (!scene.isVisible) return null;

  return (
    <aside className={styles.scene} aria-label={scene.eyebrow}>
      <div className={styles.card}>
        {scene.imageUrl ? (
          <img
            className={styles.photo}
            src={scene.imageUrl}
            alt={scene.altText}
            width={1536}
            height={864}
            loading="eager"
            decoding="async"
          />
        ) : null}
        <div className={styles.content}>
          <small className={styles.eyebrow}>{scene.eyebrow}</small>
          <strong className={styles.headline}>{scene.headline}</strong>
          {scene.body ? <p className={styles.body}>{scene.body}</p> : null}
          {scene.ctaLabel && scene.ctaUrl ? (
            <a className={styles.cta} href={scene.ctaUrl}>
              {scene.ctaLabel} <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
