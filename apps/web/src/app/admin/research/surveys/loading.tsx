export default function ResearchSurveysLoading() {
  return <main className="vendor-app admin-app" aria-busy="true" aria-live="polite">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Research · Control center</div>
        <h1>Surveys</h1>
        <p className="lead">Loading survey workspaces…</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div>
          <span className="eyebrow">Studies</span>
          <h2>Your surveys</h2>
        </div>
      </div>
      <div className="analytics-workflow-grid">
        {[0, 1, 2].map((item) => <article className="analytics-workflow-card" key={item}>
          <span>Loading</span>
          <strong>Survey workspace</strong>
          <small>Preparing study metadata…</small>
        </article>)}
      </div>
    </section>
  </main>;
}
