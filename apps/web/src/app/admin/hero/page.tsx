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
          <div className="eyebrow">Homepage content</div>
          <h1>Hero banners</h1>
          <p className="lead">Upload, σειρά προβολής, links και visible/hidden toggle για το carousel της αρχικής — χωρίς αλλαγή κώδικα.</p>
        </div>
      </section>
      <AdminHomepageHeroManager slides={slides} csrfToken={content.csrfToken} />
    </main>
  );
}
