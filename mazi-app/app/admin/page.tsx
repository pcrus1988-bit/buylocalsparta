import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default function MaziAdminRedirect() {
  redirect("https://kontamou.site/admin/mazi");
}
