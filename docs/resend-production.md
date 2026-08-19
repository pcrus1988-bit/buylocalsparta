# Resend production configuration

Buy Local Sparta uses Resend for customer verification, transactional vendor email, provider delivery feedback, and inbound email receiving.

## Required Vercel environment variables

Set these for **Production** and for Preview when end-to-end preview testing is required:

```text
BLS_EMAIL_DELIVERY_ENABLED=true
RESEND_API_KEY=<Resend API key>
RESEND_FROM=Buy Local Sparta <notifications@YOUR_VERIFIED_SENDING_DOMAIN>
RESEND_REPLY_TO=<address on your Resend receiving domain>
RESEND_WEBHOOK_SECRET=<signing secret of the Resend webhook>
BLS_NOTIFICATION_SUPPRESSION_SECRET=<stable random secret of at least 32 characters>
BLS_OPERATIONS_EMAIL=<human operations mailbox>
BLS_EMAIL_RECEIVING_ENABLED=true
RESEND_INBOUND_FORWARD_TO=<human mailbox that should receive inbound/reply messages>
BLS_PUBLIC_BASE_URL=https://kontamou.site
```

`RESEND_INBOUND_FORWARD_TO` must not be the same address/domain route that loops back into the Resend receiving webhook. A normal human mailbox such as the operations inbox is the intended destination.

## Resend webhook

Configure the Resend webhook URL as:

```text
https://kontamou.site/api/webhooks/resend
```

Subscribe it to delivery feedback events used by the notification service (especially bounce, complaint and failed events) and to `email.received` for inbound mail.

The endpoint verifies the raw webhook payload with the Svix headers and `RESEND_WEBHOOK_SECRET`. For `email.received`, it retrieves the full received message from the Resend Receiving API and forwards a readable copy to `RESEND_INBOUND_FORWARD_TO` (or `BLS_OPERATIONS_EMAIL` as fallback).

## Sending flows

- Customer registration: verification email with signed verification link.
- Vendor application: acknowledgement to applicant plus optional alert to `BLS_OPERATIONS_EMAIL`.
- Vendor onboarding transition: status email when admin moves the application through verification/catalog/test-ready/active/restricted/suspended/closed.
- Research vendor outreach: governed admin endpoint at `/api/admin/research-vendors/:id/email`.
- Durable notification email: Resend provider, retry/lease handling and bounce/complaint suppression remain backed by PostgreSQL.

## Health check

`/api/health/ready` treats enabled email as a deployment readiness dependency. It checks the required Resend/suppression configuration, inbound forwarding configuration when receiving is enabled, and Resend's sending-domain readiness.

Do not enable `BLS_EMAIL_DELIVERY_ENABLED=true` until the required variables are present; partial configuration intentionally makes readiness fail.
