import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminStoryMediaForm } from "../../../components/AdminStoryMediaForm";
import { adminContentWorkspace } from "../../../lib/admin-governance-runtime";
import { adminMerchantStoryMediaWorkspace } from "../../../lib/admin-merchant-story-media";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  let storyMedia;
  try {
    [data, storyMedia] = await Promise.all([
      adminContentWorkspace(principal),
      adminMerchantStoryMediaWorkspace(principal)
    ]);
  } catch {
    redirect("/admin");
  }

  return (
    <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={data.csrfToken} />
      <section className="shell vendor-hero vendor-hero-compact">
        <div>
          <div className="eyebrow">Versioned Greek-first content</div>
          <h1>CMS & SEO</h1>
          <p className="lead">Pages and merchant stories are governed content records. Public merchant photography is linked only from already-approved Vendor-owned media.</p>
        </div>
      </section>

      <section className="shell vendor-section">
        <AdminJsonForm
          endpoint="/api/admin/content"
          csrfToken={data.csrfToken}
          label="Create draft"
          fields={[
            { name: "slug", label: "Slug" },
            { name: "title", label: "Greek title" },
            { name: "description", label: "SEO / intro description" }
          ]}
        />
        <div className="vendor-order-list admin-list-gap">
          {data.pages.map((page) => (
            <article className="vendor-order" key={page.id}>
              <div className="vendor-order-head">
                <div><strong>/{page.slug}</strong><small>v{page.version} · {page.pageType}</small></div>
                <span className="status-pill">{page.status}</span>
              </div>
              <div className="admin-button-row">
                {page.status !== "published" && page.status !== "archived" && <AdminActionButton label="Publish" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "publish" }} />}
                {page.status !== "archived" && <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Archive reason" danger />}
                {page.status === "archived" && <AdminActionButton label="Restore draft" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "restore" }} />}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell vendor-section">
        <div className="section-heading compact-heading">
          <div><div className="eyebrow">Merchant storytelling</div><h2>Εικόνα δημόσιου προφίλ</h2></div>
          <p className="section-note">Μόνο media του ίδιου Vendor που έχουν περάσει malware scan, rights review και moderation μπορούν να συνδεθούν. Κενή επιλογή επαναφέρει το ασφαλές γραφικό fallback.</p>
        </div>
        {!storyMedia.available ? (
          <div className="empty-state"><h3>Η σύνδεση merchant media απαιτεί PostgreSQL runtime.</h3><p>Το database-less preview δεν αποθηκεύει πραγματικές media associations.</p></div>
        ) : storyMedia.stories.length ? (
          <div className="vendor-order-list admin-list-gap">
            {storyMedia.stories.map((story) => (
              <article className="vendor-order" key={story.storyId}>
                <div className="vendor-order-head">
                  <div><strong>{story.title}</strong><small>{story.vendorName} · {story.status}</small></div>
                  <span className="status-pill">{story.currentMediaId ? "photo linked" : "fallback art"}</span>
                </div>
                <AdminStoryMediaForm
                  storyId={story.storyId}
                  csrfToken={storyMedia.csrfToken}
                  currentMediaId={story.currentMediaId}
                  candidates={story.candidates}
                />
                {!story.candidates.length && <small>Δεν υπάρχει ακόμη εγκεκριμένο merchant/story image για αυτό το κατάστημα.</small>}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><h3>Δεν υπάρχουν merchant stories.</h3><p>Η φωτογραφία συνδέεται σε συγκεκριμένο merchant story ώστε η δημόσια χρήση να παραμένει ρητά εγκεκριμένη.</p></div>
        )}
      </section>
    </main>
  );
}
