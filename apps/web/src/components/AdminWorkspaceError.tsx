"use client";

import Link from "next/link";

export function AdminWorkspaceError({ title, reset }: Readonly<{ title: string; reset: () => void }>) {
  return <main className="vendor-app admin-app">
    <section className="shell vendor-section">
      <div className="workspace-queue-card" role="alert">
        <strong>{title} could not finish loading.</strong>
        <p>The control centre is still available. Retry this workspace; if the catalogue database is busy, the request will start cleanly again.</p>
        <div className="workspace-action-buttons">
          <button className="button button-primary" type="button" onClick={reset}>Retry</button>
          <Link className="button button-secondary" href="/admin/products">Products &amp; Categories</Link>
        </div>
      </div>
    </section>
  </main>;
}
