"use client";

type Experience = "color" | "care" | "style";

export default function PremiumHero({ onOpen }: { onOpen: (experience: Experience) => void }) {
  return (
    <section className="nyxi-premium-hero" aria-labelledby="hero-title">
      <div className="hero-story">
        <div className="hero-overline"><span className="hero-spark" aria-hidden="true">✳</span><span>THE PERSONAL NAIL STUDIO</span><span className="hero-edition">EST. 2026</span></div>
        <h1 id="hero-title">Ένας κόσμος<br />στα <em>άκρα σου.</em></h1>
        <p className="hero-lead">Χρώμα, δημιουργία και φροντίδα — σε μια εμπειρία σχεδιασμένη αποκλειστικά για εσένα. Ανακάλυψε την επόμενη απόχρωσή σου.</p>
        <div className="hero-actions">
          <button type="button" className="hero-primary" onClick={() => onOpen("color")}>Ανακάλυψε το χρώμα σου <span aria-hidden="true">↗</span></button>
          <button type="button" className="hero-secondary" onClick={() => onOpen("style")}>Μπες στο Nail Atelier <span aria-hidden="true">↗</span></button>
        </div>
        <div className="hero-proof"><span className="proof-line" aria-hidden="true" /><span>YOUR SHADE. YOUR SHAPE. YOUR RITUAL.</span></div>
      </div>
      <div className="hero-showcase" aria-label="Καλλιτεχνική σύνθεση με τρεις αποχρώσεις βερνικιού NYXI">
        <div className="showcase-light" aria-hidden="true" />
        <div className="showcase-topline"><span>NYXI / THE COLOR EDIT</span><span>VOL. 01 — 2026</span></div>
        <div className="polish-composition" aria-hidden="true">
          <div className="polish-bottle polish-bottle-left">
            <div className="polish-cap" /><div className="polish-neck" />
            <div className="polish-glass"><div className="polish-pigment" /><div className="polish-brand">NYXI<span>STUDIO</span></div></div>
          </div>
          <div className="polish-bottle polish-bottle-center">
            <div className="polish-cap" /><div className="polish-neck" />
            <div className="polish-glass"><div className="polish-pigment" /><div className="polish-brand">NYXI<span>STUDIO</span></div></div>
          </div>
          <div className="polish-bottle polish-bottle-right">
            <div className="polish-cap" /><div className="polish-neck" />
            <div className="polish-glass"><div className="polish-pigment" /><div className="polish-brand">NYXI<span>STUDIO</span></div></div>
          </div>
        </div>
        <div className="showcase-signature" aria-hidden="true">a little<br />color story.</div>
        <div className="showcase-bottomline"><span>ART DIRECTION / NYXI</span><span>01 / 04</span></div>
      </div>
    </section>
  );
}
