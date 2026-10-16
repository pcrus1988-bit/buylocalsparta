export type CatalogSearchInput={query:string;limit:number};
export function parseCompanionCatalogSearch(value:unknown):CatalogSearchInput{
 if(typeof value!=="string")throw Error("INVALID_SEARCH");
 const query=value.normalize("NFKC").trim().replace(/\s+/g," ");
 if(query.length<2||query.length>72||!/[\p{L}\p{N}]/u.test(query)
   ||/[\u0000-\u001f\u007f]/.test(query))throw Error("INVALID_SEARCH");
 const words=query.split(" ").filter(Boolean);
 if(words.length>8||words.some(w=>w.length>40))throw Error("INVALID_SEARCH");
 return {query,limit:12};
}
