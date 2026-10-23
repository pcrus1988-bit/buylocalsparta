"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { implicitEmailSession } from "../../../lib/implicit-email-session";

const INVALID_LINK = "/join?notice=expired_link";

/** Complete legacy/implicit email links without exposing tokens to the server.
 * This component must only be mounted at the fixed MAZI /auth/finish route.
 */
export default function FinishMagicLink() {
  const attempted = useRef(false);
  const [message, setMessage] = useState("Ελέγχουμε τον σύνδεσμο σύνδεσης…");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Fragment credentials are never sent in the HTTP request, but can be read
    // by browser scripts. Remove them from the URL BEFORE initializing Auth.
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    window.history.replaceState(window.history.state, "", "/auth/finish");
    const credentials = implicitEmailSession(fragment);
    if (!credentials) {
      window.location.replace(INVALID_LINK);
      return;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setMessage("Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη.");
      return;
    }

    // @supabase/ssr uses the same cookie storage as the server client, so the
    // subsequent /members request can verify the session with getUser().
    // Never log credentials, put them in URLs or send them to our application.
    try {
      const auth = createBrowserClient(url, key);
      void auth.auth.setSession(credentials)
        .then(({ data, error }) => {
          if (error || !data.user || !data.session) {
            window.location.replace(INVALID_LINK);
            return;
          }
          window.location.replace("/members");
        })
        .catch(() => {
          window.location.replace(INVALID_LINK);
        });
    } catch {
      window.location.replace(INVALID_LINK);
    }
  }, []);

  return (
    <main id="content">
      <section className="section shell auth-section">
        <div className="form-panel" role="status" aria-live="polite">
          <span className="eyebrow">ΜΑΖΙ / ΑΣΦΑΛΗΣ ΣΥΝΔΕΣΗ</span>
          <h1>Ολοκλήρωση σύνδεσης</h1>
          <p>{message}</p>
          <p className="legal-hint">
            Αν ο σύνδεσμος έχει λήξει, θα επιστρέψεις στη σύνδεση για να ζητήσεις νέο.
          </p>
        </div>
      </section>
    </main>
  );
}
