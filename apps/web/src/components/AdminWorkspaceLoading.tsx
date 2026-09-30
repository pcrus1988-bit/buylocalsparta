export function AdminWorkspaceLoading({ title, note }: Readonly<{ title: string; note?: string }>) {
  return <main className="vendor-app admin-app">
    <section className="shell vendor-section">
      <div className="workspace-queue-card" aria-live="polite" aria-busy="true">
        <strong>Opening {title}…</strong>
        <p>{note ?? "Loading the bounded first view. Expensive catalogue work should not block navigation feedback."}</p>
        <div className="workspace-inline-note">You can keep this workspace open; retry controls appear automatically if loading fails.</div>
      </div>
    </section>
  </main>;
}
