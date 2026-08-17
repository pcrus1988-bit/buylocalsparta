# AADE myDATA ERP Runbook — Build 0.39

## Purpose

Buy Local Sparta is architected as the consumer-facing seller of record. The repository therefore prepares an **AADE myDATA ERP-channel transport adapter** for platform-issued tax documents. This is a technical readiness layer only: it does **not** choose the legally correct invoice type, income classification, VAT treatment, retail/FIM/provider channel or digital-dispatch mapping on behalf of the accountant.

## Current AADE baseline used by this build

- AADE currently publishes myDATA ERP technical specification **v2.0.1** on the production technical-specifications page.
- AADE's test environment currently advertises **v2.0.2**, including additional Digital Goods Movement / delivery-note lifecycle functions.
- ERP authentication uses the `aade-user-id` and `Ocp-Apim-Subscription-Key` headers.
- Production ERP invoice transmission uses the `SendInvoices` method under the production myDATA API base.

Official starting points:
- https://www.aade.gr/mydata/tehnikes-prodiagrafes-ekdoseis-mydata
- https://www.aade.gr/mydata-ilektronika-biblia-aade/mydata/dokimastiko-periballon
- https://www.aade.gr/mydata/emporika-logistika-programmata-diaheirisis-erp

## Safety gates

`BLS_MYDATA_ISSUANCE_ENABLED=false` is the default and must remain false until all of the following are signed off:

1. Seller-of-record contract/accounting model.
2. Correct B2C/B2B document types for the marketplace flows.
3. Product and delivery VAT treatment.
4. Income-classification mapping and any expense-classification responsibilities.
5. Credit-note/refund mapping.
6. Whether retail issuance must route through ERP, FIM/esend, a licensed e-invoicing provider, or another approved channel for each flow.
7. Digital Goods Movement / delivery-note obligations and phase/version applicable to BLS and participating suppliers.

When enabled, `BLS_MYDATA_MAPPING_VERSION` is mandatory and each tax document must carry that exact mapping version plus pre-generated accountant-approved myDATA XML. The transport service will not invent or repair classifications.

## Configuration

- `AADE_MYDATA_ENVIRONMENT=test|production`
- `AADE_MYDATA_BASE_URL` — mandatory in test; production defaults to `https://mydatapi.aade.gr/myDATA`
- `AADE_MYDATA_USER_ID`
- `AADE_MYDATA_SUBSCRIPTION_KEY`
- `AADE_MYDATA_SPEC_VERSION`
- `AADE_MYDATA_REQUEST_TIMEOUT_MS`
- `BLS_MYDATA_MAPPING_VERSION`
- `BLS_MYDATA_ISSUANCE_ENABLED`

Use `npm run mydata:check` to perform a read-only credential/connectivity call (`RequestTransmittedDocs`) after credentials are installed.

## Transmission behavior

Prepared tax documents are stored in `tax_documents`; each outbound operation creates `mydata_transmission_attempts`.

A network/timeout outcome during `SendInvoices` is **not retried blindly**. It moves to `manual_review` because AADE may have accepted the document before the connection failed. Reconciliation must confirm whether a MARK/UID exists before another issue attempt.

A successful result persists AADE MARK, UID and QR URL. Validation rejections remain auditable and do not mark the tax document issued.

## Digital movement

AADE's Digital Goods Movement specification has an independent lifecycle. The test environment currently includes RegisterTransfer, ConfirmDeliveryOutcome, RejectDeliveryNote, GetDeliveryNoteStatus, group QR functions and ConfirmDeliveryReturn additions. BLS should not couple courier handover to those methods until the accountant/logistics adviser confirms which party is issuer/transporter and which document type applies.
