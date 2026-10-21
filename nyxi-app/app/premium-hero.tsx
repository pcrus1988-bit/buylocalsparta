"use client";

type Experience = "color" | "care" | "style";

const PHOTOGRAPH =
  "https://images.unsplash.com/photo-1638668518908-7014917e4507?auto=format&fit=crop&w=1600&q=85";

export default function PremiumHero({ onOpen }: { onOpen: (experience: Experience) => void }) {
  return (
    <section className="nyxi-cover" aria-labelledby="hero-title">
      <div className="nyxi-cover-media" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 640px)"
            srcSet="https://images.unsplash.com/photo-1638668518908-7014917e4507?auto=format&fit=crop&w=960&q=82"
          />
          <img className="nyxi-cover-photo" src={PHOTOGRAPH} alt="" loading="eager" decoding="async" fetchPriority="high" />
        </picture>
        <div className="nyxi-cover-film" />
      </div>

      <div className="nyxi-cover-masthead">
        <span>NYXI / THE BEAUTY EDIT</span>
        <span>VOL. 01 <span aria-hidden="true">—</span> NAIL CULTURE</span>
      </div>

      <div className="nyxi-cover-copy">
        <span className="nyxi-cover-eyebrow"><span aria-hidden="true" className="nyxi-cover-asterisk">✳</span> THE PERSONAL NAIL EXPERIENCE</span>
        <h1 id="hero-title">Η απόχρωση<br /><em>είσαι εσύ.</em></h1>
        <p>Χρώμα, προσωπική φροντίδα και δημιουργία. Ένα nail studio που ξεκινά από εσένα — όχι από μια τάση.</p>
        <div className="nyxi-cover-actions">
          <button type="button" className="nyxi-cover-primary" onClick={() => onOpen("color")}>
            <span>Βρες την απόχρωσή σου</span>
            <span className="nyxi-cover-action-mark" aria-hidden="true">↗</span>
          </button>
          <button type="button" className="nyxi-cover-text-link" onClick={() => onOpen("style")}>
            Σχεδίασε ένα look <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      <div className="nyxi-cover-footer">
        <span>EXPRESS YOURSELF / EVERY DETAIL</span>
        <span>SCROLL TO EXPLORE <span aria-hidden="true">↓</span></span>
      </div>
      <a className="nyxi-photo-credit" href="https://unsplash.com/photos/a-pair-of-hands-with-red-nail-polish-against-a-white-wall-mVsnJ3J46S8" target="_blank" rel="noopener noreferrer">Photo: Bansah Photography / Unsplash</a>
    </section>
  );
}
