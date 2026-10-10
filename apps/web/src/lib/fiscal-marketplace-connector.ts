/**
 * Marketplace-side optional, non-fiscal bridge.
 * No marketplace order trigger imports this module yet.
 *
 * Reuse the established marketplace order snapshot and payment provider evidence
 * ONLY after the correct legal seller has been verified. Never use a fulfilment
 * vendor's AFM as the issuer for a marketplace seller-of-record transaction.
 */
export type MarketplaceFiscalDraftRequest=Readonly<{
  orderPublicReference:string;
  legalIssuerVatNumber:string;
  grossMinor:number;
  lane:"b2c"|"b2b";
}>;

export type MarketplaceFiscalDraftResult=Readonly<{
  draftId:string;
  created:boolean;
  status:"draft";
}>;

export async function sendMarketplaceFiscalPreview(input:MarketplaceFiscalDraftRequest):Promise<MarketplaceFiscalDraftResult>{
  if(process.env.FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED!=="true")
    throw new Error("FISCAL_MARKETPLACE_CONNECTOR_DISABLED");
  const endpoint=process.env.FISCAL_SERVICE_BASE_URL?.trim();
  const apiKey=process.env.FISCAL_MARKETPLACE_TEST_API_KEY?.trim();
  const authorizedIssuer=process.env.FISCAL_MARKETPLACE_ISSUER_VAT?.trim();
  if(!endpoint||!apiKey||!authorizedIssuer)throw new Error("FISCAL_MARKETPLACE_CONNECTOR_NOT_CONFIGURED");
  if(!/^kmf_test_[A-Za-z0-9_-]{43}$/.test(apiKey))throw new Error("FISCAL_MARKETPLACE_TEST_TOKEN_INVALID");
  if(!/^[0-9]{9}$/.test(authorizedIssuer)||input.legalIssuerVatNumber!==authorizedIssuer)
    throw new Error("FISCAL_MARKETPLACE_ISSUER_NOT_AUTHORIZED");
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(input.orderPublicReference))
    throw new Error("FISCAL_MARKETPLACE_REFERENCE_INVALID");
  if(!Number.isSafeInteger(input.grossMinor)||input.grossMinor<0||input.grossMinor>1e12)
    throw new Error("FISCAL_MARKETPLACE_AMOUNT_INVALID");
  if(!["b2b","b2c"].includes(input.lane))throw new Error("FISCAL_MARKETPLACE_LANE_INVALID");
  let url:URL;
  try{
    url=new URL("/timologio/api/v1/drafts",endpoint);
    if(url.protocol!=="https:" || url.username || url.password || url.hash)
      throw new Error("INSECURE_FISCAL_ENDPOINT");
  }catch{throw new Error("FISCAL_MARKETPLACE_URL_INVALID");}
  const response=await fetch(url,{
    method:"POST",
    headers:{"content-type":"application/json","authorization":'Bearer '+apiKey},
    body:JSON.stringify({
      lane:input.lane,
      externalId:"KM-"+input.orderPublicReference,
      reference:input.orderPublicReference,
      currency:"EUR",
      grossMinor:input.grossMinor,
      issuerVatNumber:input.legalIssuerVatNumber
    }),
    cache:"no-store",
    signal:AbortSignal.timeout(8000)
  });
  const result=await response.json() as {
    created?:boolean;error?:string;
    document?:{id?:string;status?:string};
  };
  if(!response.ok||!result.document?.id||result.document.status!=="draft")
    throw new Error("FISCAL_MARKETPLACE_DRAFT_SYNC_FAILED");
  return {draftId:result.document.id,created:result.created===true,status:"draft"};
}
