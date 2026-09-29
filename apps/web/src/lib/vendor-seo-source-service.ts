import { PostgresUnitOfWork, assertVendorCapability, buildVendorOperatingContextFromSession, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";

async function contextFor(principal:SessionPrincipal){
  const assignment=await resolveVendorOperatingAssignment(principal);
  const context=buildVendorOperatingContextFromSession(principal,assignment);
  assertVendorCapability(context,"seo.source_data.manage");
  return context;
}

export async function vendorSeoSourceWorkspace(principal:SessionPrincipal){
  const context=await contextFor(principal);
  const uow=new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  return uow.withTransaction({actorUserId:principal.userId,vendorId:context.vendorId,marketId:context.marketId},async(tx)=>{
    const result=await tx.query<SqlRow>(`
      SELECT t.short_description,t.story,t.expertise,t.seo_title,t.seo_description
      FROM vendor_businesses v
      LEFT JOIN vendor_profile_translations t ON t.vendor_id=v.id AND t.locale='el'
      WHERE v.public_id=$1 OR v.id::text=$1
      LIMIT 1
    `,[context.vendorId]);
    const row=result.rows[0]??{};
    const value=(v:unknown)=>typeof v==="string"?v:"";
    return {
      shortDescription:value(row.short_description),
      story:value(row.story),
      expertise:value(row.expertise),
      seoTitle:value(row.seo_title),
      seoDescription:value(row.seo_description)
    };
  },{readOnly:true});
}

export async function updateVendorSeoSource(principal:SessionPrincipal,input:{shortDescription:string;story:string;expertise:string;seoTitle:string;seoDescription:string}){
  const context=await contextFor(principal);
  const clean={
    shortDescription:input.shortDescription.trim(),
    story:input.story.trim(),
    expertise:input.expertise.trim(),
    seoTitle:input.seoTitle.trim(),
    seoDescription:input.seoDescription.trim()
  };
  if(clean.seoTitle.length>80) throw new Error("Ο SEO τίτλος δεν πρέπει να ξεπερνά τους 80 χαρακτήρες.");
  if(clean.seoDescription.length>220) throw new Error("Η SEO περιγραφή δεν πρέπει να ξεπερνά τους 220 χαρακτήρες.");
  if(clean.shortDescription.length>600) throw new Error("Η σύντομη περιγραφή είναι πολύ μεγάλη.");
  const uow=new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  return uow.withTransaction({actorUserId:principal.userId,vendorId:context.vendorId,marketId:context.marketId},async(tx)=>{
    await tx.query(`
      INSERT INTO vendor_profile_translations(vendor_id,locale,story,expertise,short_description,seo_title,seo_description)
      SELECT v.id,'el',$2,$3,$4,$5,$6 FROM vendor_businesses v
      WHERE v.public_id=$1 OR v.id::text=$1
      ON CONFLICT(vendor_id,locale) DO UPDATE SET
        story=EXCLUDED.story,
        expertise=EXCLUDED.expertise,
        short_description=EXCLUDED.short_description,
        seo_title=EXCLUDED.seo_title,
        seo_description=EXCLUDED.seo_description
    `,[context.vendorId,clean.story,clean.expertise,clean.shortDescription,clean.seoTitle,clean.seoDescription]);
    return {ok:true};
  });
}
