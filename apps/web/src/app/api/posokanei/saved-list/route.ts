import {getAccountSession,requireAccountSession} from "../../../../lib/account-session";
import {getProductionPostgresRuntime} from "../../../../lib/postgres-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

type SavedList={lines:Array<Record<string,unknown>>;labels:Record<string,string>;excluded:string[];maxStores:number;progress:{key:string;completed:string[]};dismissedAlternativeLines?:string[]};

function validList(value:unknown):value is SavedList{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const v=value as Partial<SavedList>;
  if(!Array.isArray(v.lines)||v.lines.length>20||
     !v.lines.every(l=>l&&typeof l==="object"&&!Array.isArray(l)&&typeof l.id==="string"&&/^line_[a-z0-9]{1,30}$/.test(l.id)&&
       ((l.kind==="exact"&&typeof l.sourceProductId==="string"&&l.sourceProductId.length<=140&&typeof l.packageCount==="number"&&Number.isSafeInteger(l.packageCount)&&l.packageCount>=1&&l.packageCount<=100&&
          (l.lockedRetailerId===undefined||(typeof l.lockedRetailerId==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(l.lockedRetailerId))))||
        (l.kind==="group"&&typeof l.groupId==="string"&&l.groupId.length<=140&&typeof l.requiredBaseQuantity==="number"&&Number.isFinite(l.requiredBaseQuantity)&&l.requiredBaseQuantity>0&&l.requiredBaseQuantity<=100))))return false;
  if(!v.labels||typeof v.labels!=="object"||Array.isArray(v.labels)||Object.keys(v.labels).length>20||
     !Object.entries(v.labels).every(([k,val])=>/^line_[a-z0-9]{1,30}$/.test(k)&&typeof val==="string"&&val.length<=220))return false;
  if(!Array.isArray(v.excluded)||v.excluded.length>24||
     !v.excluded.every(id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id)))return false;
  if(typeof v.maxStores!=="number"||!Number.isSafeInteger(v.maxStores)||v.maxStores<1||v.maxStores>5)return false;
  if(!v.progress||typeof v.progress!=="object"||typeof v.progress.key!=="string"||v.progress.key.length>3000||
     !Array.isArray(v.progress.completed)||v.progress.completed.length>20||
     !v.progress.completed.every(id=>typeof id==="string"&&/^line_[a-z0-9]{1,30}$/.test(id)))return false;
  if(v.dismissedAlternativeLines!==undefined&&(!Array.isArray(v.dismissedAlternativeLines)||
     v.dismissedAlternativeLines.length>20||
     !v.dismissedAlternativeLines.every(id=>typeof id==="string"&&/^line_[a-z0-9]{1,30}$/.test(id)&&v.lines!.some(line=>line.id===id))))return false;
  return true;
}

export async function GET(){
  try{
    const principal=await getAccountSession();
    if(!principal||!principal.roles.includes("customer"))return Response.json({authenticated:false},{status:401,headers});
    const data=await getProductionPostgresRuntime().nativePool.query<{list_data:SavedList;updated_at:string}>(
      "SELECT list_data,updated_at FROM public.posokanei_saved_shopping_lists WHERE user_id=$1 LIMIT 1",[principal.userId]
    );
    return Response.json({authenticated:true,csrfToken:principal.csrfToken,
      saved:data.rows[0]?.list_data??null,updatedAt:data.rows[0]?.updated_at??null},{headers});
  }catch{
    return Response.json({error:"Αδυναμία ανάκτησης αποθηκευμένης λίστας."},{status:503,headers});
  }
}

export async function POST(request:Request){
  try{
    const principal=await requireAccountSession(request,true);
    const raw=await request.text();
    if(raw.length>24000)return Response.json({error:"Η λίστα είναι πολύ μεγάλη."},{status:413,headers});
    let body:unknown;
    try{body=JSON.parse(raw);}catch{return Response.json({error:"Μη έγκυρα δεδομένα λίστας."},{status:400,headers});}
    if(!validList(body))return Response.json({error:"Μη έγκυρα στοιχεία λίστας."},{status:400,headers});
    const result=await getProductionPostgresRuntime().nativePool.query<{updated_at:string}>(`
      INSERT INTO public.posokanei_saved_shopping_lists (user_id,list_data,updated_at)
      VALUES ($1,$2::jsonb,now())
      ON CONFLICT (user_id) DO UPDATE
        SET list_data=EXCLUDED.list_data,updated_at=now()
      RETURNING updated_at
    `,[principal.userId,JSON.stringify(body)]);
    return Response.json({saved:true,updatedAt:result.rows[0]?.updated_at??null},{headers});
  }catch(e){
    if(e instanceof Error&&e.message==="AUTH_REQUIRED")return Response.json({error:"Χρειάζεται σύνδεση."},{status:401,headers});
    return Response.json({error:"Δεν ήταν δυνατή η αποθήκευση της λίστας."},{status:503,headers});
  }
}
