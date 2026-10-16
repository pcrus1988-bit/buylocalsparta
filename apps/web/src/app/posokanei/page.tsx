import type {Metadata} from "next";
import {SiteHeader} from "../../components/SiteHeader";
import {SiteFooter} from "../../components/SiteFooter";
import {PosoKaneiPublicClient} from "../../components/PosoKaneiPublicClient";
import {publicReferenceEnabled} from "../../lib/posokanei-public-runtime";
export const dynamic="force-dynamic";
export function generateMetadata():Metadata{
  return {
    title:"KONTA MOY × PosoKanei | Σύγκριση τιμών σούπερ μάρκετ",
    description:"Ανεξάρτητη σύγκριση καταγεγραμμένων τιμών και σχεδιασμός λίστας αγορών ανά σούπερ μάρκετ.",
    alternates:{canonical:"/posokanei"},
    // Do not index an unpublished price service.
    robots:publicReferenceEnabled()?{index:true,follow:true}:{index:false,follow:true}
  };
}
export default function PosoKaneiPage(){
  return <main><SiteHeader /><PosoKaneiPublicClient/><SiteFooter /></main>;
}
