import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {SiteHeader} from "../../../components/SiteHeader";
import {AccountSectionNavigation} from "../../../components/AccountSectionNavigation";
import {NearbyOffersClient} from "../../../components/NearbyOffersClient";
import {getAccountSession} from "../../../lib/account-session";
import {getNearbyPreference} from "../../../lib/nearby-offers";
export const metadata:Metadata={title:"Αποκλειστικές κοντινές προσφορές",robots:{index:false,follow:false}};
export default async function NearbyOffersPage(){
  const principal=await getAccountSession();
  if(!principal)redirect("/login?next=/account/nearby-offers");
  const preference=await getNearbyPreference(principal);
  return <main className="account-app">
    <div className="announcement">Ειδικές προσφορές από τοπικά καταστήματα, μόνο με τη συγκατάθεσή σου.</div>
    <SiteHeader compact/><AccountSectionNavigation/>
    <section className="shell customer-account-page">
      <NearbyOffersClient initial={preference} csrfToken={principal.csrfToken}/>
    </section>
  </main>;
}
