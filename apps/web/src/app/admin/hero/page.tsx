import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminHomepageHeroManager } from "../../../components/AdminHomepageHeroManager";
import { adminContentWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { listHomepageHeroSlides } from "../../../lib/homepage-hero-runtime";

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let content;
  try {
    content = await adminContentWorkspace(principal);
  } catch {
    redirect("/admin");
  }

  const slides = await listHomepageHeroSlides();

  return (
    <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={content.csrfToken} />
      <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
        <div>
          <div className="eyebrow">Content · Homepage</div>
          <h1>Homepage merchandising</h1>
          <p className="lead">Hero slides, σειρά προβολής, links και visible/hidden state για την αρχική — χωρίς αλλαγή κώδικα και χωρίς να αναμειγνύεται με CMS publishing.</p>
          <div className="hero-actions"><Link className="button button-secondary" href="/admin/content">Content operations</Link></div>
        </div>
      </section>
      <AdminHomepageHeroManager slides={slides} csrfToken={content.csrfToken} />
    </main>
  );
}
