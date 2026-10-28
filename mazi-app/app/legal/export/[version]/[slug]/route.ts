import {NextResponse} from "next/server";
import {legalOrder,type LegalSlug} from "../../../../../lib/legal-documents";
import {MAZI_ARCHIVED_VERSION,archivedRecord,archivedText,archivedDigest} from "../../../../../lib/legal/legal-archive";
export const dynamicParams=false;
export function generateStaticParams(){return legalOrder.map(slug=>({version:MAZI_ARCHIVED_VERSION,slug}));}
export async function GET(_request:Request,{params}:{params:Promise<{version:string;slug:string}>}){
 const {version,slug}=await params;const doc=archivedRecord(version,slug);
 if(!doc)return new NextResponse("Η ιστορική έκδοση δεν βρέθηκε.",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
 const body=archivedText(slug as LegalSlug,doc);
 return new NextResponse(body,{
  status:200,
  headers:{
   "Content-Type":"text/plain; charset=utf-8",
   "Content-Disposition":`attachment; filename="MAZI-${slug}-${version}.txt"`,
   "Cache-Control":"public, max-age=86400, immutable",
   "X-Legal-Content-SHA256":archivedDigest(doc),
   "X-Content-Type-Options":"nosniff"
  }
 });
}
