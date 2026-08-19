import { ResendEmailProvider, resendConfigFromEnv, resendDeliveryEnabled } from "@buy-local-sparta/resend-notifications";
import { WEB_BUILD_VERSION } from "../../../../lib/build";
import { productionDatabaseReadiness } from "../../../../lib/postgres-runtime";
import { vivaPaymentsProviderReadiness } from "../../../../lib/viva-runtime";
import { mediaPipelineReadiness } from "../../../../lib/media-upload-service";
import { myDataReadiness } from "../../../../lib/mydata-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await productionDatabaseReadiness();
  const viva = await vivaPaymentsProviderReadiness();
  const media = await mediaPipelineReadiness();
  const myData = myDataReadiness();

  const searchEnabled = process.env.BLS_SEARCH_ENABLED === "true";
  let search = { enabled: searchEnabled, ready: !searchEnabled, status: searchEnabled ? "unavailable" : "disabled" };
  if (searchEnabled && database.ok) {
    try {
      const health = await (await import("../../../../lib/postgres-runtime")).getProductionPostgresRuntime().search?.readiness();
      search = { enabled: true, ready: Boolean(health?.ok), status: health?.status ?? "unavailable" };
    } catch {
      search = { enabled: true, ready: false, status: "unavailable" };
    }
  }

  const boxNowEnabled = process.env.BLS_BOXNOW_ENABLED === "true";
  let shipping = { enabled: boxNowEnabled, ready: !boxNowEnabled, provider: boxNowEnabled ? "boxnow" : "disabled", message: boxNowEnabled ? "unavailable" : "disabled" };
  if (boxNowEnabled && database.ok) {
    try {
      const health = await (await import("../../../../lib/postgres-runtime")).getProductionPostgresRuntime().boxNowShipping?.readiness();
      shipping = { enabled: true, ready: Boolean(health?.ok), provider: "boxnow", message: health?.message ?? "unavailable" };
    } catch (error) {
      shipping = { enabled: true, ready: false, provider: "boxnow", message: error instanceof Error ? error.message : "unavailable" };
    }
  }

  const emailEnabled = resendDeliveryEnabled();
  const receivingEnabled = process.env.BLS_EMAIL_RECEIVING_ENABLED === "true" || Boolean(process.env.RESEND_INBOUND_FORWARD_TO?.trim() || process.env.BLS_OPERATIONS_EMAIL?.trim());
  const emailConfig = {
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    fromConfigured: Boolean(process.env.RESEND_FROM?.trim()),
    fromDefaulted: !process.env.RESEND_FROM?.trim(),
    replyToConfigured: Boolean(process.env.RESEND_REPLY_TO?.trim()),
    replyToDefaulted: !process.env.RESEND_REPLY_TO?.trim(),
    webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    webhookSecretManagedByProvider: !process.env.RESEND_WEBHOOK_SECRET?.trim(),
    suppressionSecretConfigured: Boolean(process.env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim()),
    suppressionSecretDerived: !process.env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim() && Boolean(process.env.BLS_AUTH_SECRET?.trim()),
    operationsEmailConfigured: Boolean(process.env.BLS_OPERATIONS_EMAIL?.trim()),
    inboundForwardConfigured: Boolean(process.env.RESEND_INBOUND_FORWARD_TO?.trim()),
    publicBaseUrlConfigured: Boolean(process.env.BLS_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim())
  };
  const authSecretReady = Boolean(process.env.BLS_AUTH_SECRET?.trim() && process.env.BLS_AUTH_SECRET!.trim().length >= 32);
  const emailRequiredEnv = emailConfig.apiKeyConfigured && authSecretReady;
  const receivingReady = !receivingEnabled || emailConfig.inboundForwardConfigured || emailConfig.operationsEmailConfigured;
  let email = {
    enabled: emailEnabled,
    receivingEnabled,
    ready: !emailEnabled,
    provider: emailEnabled ? "resend" : "disabled",
    message: emailEnabled ? "unavailable" : "disabled",
    fromDomain: undefined as string | undefined,
    config: emailConfig
  };
  if (emailEnabled) {
    if (!emailRequiredEnv) {
      email = { ...email, ready: false, message: "Resend API key and production auth secret are required" };
    } else if (!receivingReady) {
      email = { ...email, ready: false, message: "Inbound email forwarding requires RESEND_INBOUND_FORWARD_TO or BLS_OPERATIONS_EMAIL" };
    } else {
      try {
        const health = await new ResendEmailProvider(resendConfigFromEnv()).readiness();
        email = { ...email, ready: health.ok, message: health.message, fromDomain: health.fromDomain };
      } catch (error) {
        email = { ...email, ready: false, message: error instanceof Error ? error.message : "Resend readiness failed" };
      }
    }
  }

  const ok = database.ok && viva.ready && media.ready && myData.ready && search.ready && email.ready && shipping.ready;
  return Response.json(
    { ok, service: "buy-local-sparta-web", build: WEB_BUILD_VERSION, dependencies: { database, viva, media, myData, search, email, shipping } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
