import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {VendorWorkspaceHeader} from "../../../../components/VendorWorkspaceHeader";
import {VendorNearbyOffersClient} from "../../../../components/VendorNearbyOffersClient";
import {getVendorSession} from "../../../../lib/vendor-session";
export const metadata:Metadata={title:"Κοντινές αποκλειστικές προσφορές",robots:{index:false,follow:false}};
export default async function VendorNearbyOffersPage(){
  const vendor=await getVendorSession();
  if(!vendor)redirect("/vendor/login");
  return <main className="vendor-app"><VendorWorkspaceHeader/><VendorNearbyOffersClient/></main>;
}
