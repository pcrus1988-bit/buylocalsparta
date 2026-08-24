import { cookies } from "next/headers";
import { DRIVER_SESSION_COOKIE, logoutDeliveryDriver } from "../../../../lib/delivery-driver-runtime";
export async function POST(request:Request){const store=await cookies(),token=store.get(DRIVER_SESSION_COOKIE)?.value;await logoutDeliveryDriver(token,Date.now()).catch(()=>undefined);store.set({name:DRIVER_SESSION_COOKIE,value:"",httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"||request.url.startsWith("https://"),path:"/",expires:new Date(0)});return Response.redirect(new URL("/driver/login",request.url),303);}
