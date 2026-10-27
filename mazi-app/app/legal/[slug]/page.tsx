import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {LegalView} from "../legal-document";
import {legalRecords, type LegalSlug} from "../../../lib/legal-documents";
export function generateStaticParams(){ return Object.keys(legalRecords).filter(s=>s!=="terms"&&s!=="privacy").map(slug=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;if(!(slug in legalRecords))return {title:"Μη διαθέσιμο"};const doc=legalRecords[slug as LegalSlug];return {title:doc.title,description:doc.summary};}
export default async function LegalCategoryPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(!(slug in legalRecords)||slug==="terms"||slug==="privacy")notFound();return <LegalView slug={slug as LegalSlug}/>;}
