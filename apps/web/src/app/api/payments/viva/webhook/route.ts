import { parseVivaWebhookJson } from "@buy-local-sparta/viva-payments";
import { requireVivaPayments } from "../../../../../lib/viva-runtime";

export const runtime = "nodejs";
export async function GET() {
  try { return Response.json({ Key: await requireVivaPayments().webhookVerificationKey() }, { headers:{"Cache-Control":"no-store"} }); }
  catch (error) { return Response.json({ error:error instanceof Error?error.message:"webhook_verification_failed" }, { status:503 }); }
}
export async function POST(request:Request) {
  try {
    const raw=await request.text();
    const envelope=parseVivaWebhookJson(raw);
    const result=await requireVivaPayments().handleWebhook(envelope,Date.now());
    return Response.json({ok:true,eventTypeId:result.eventTypeId});
  } catch(error) {
    // Non-2xx deliberately asks Viva to retry. The provider docs describe hourly retries for failed webhook delivery.
    return Response.json({error:error instanceof Error?error.message:"viva_webhook_failed"},{status:503});
  }
}
