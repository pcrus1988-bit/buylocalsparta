import { AadeMyDataClient as BaseAadeMyDataClient, type MyDataTransmissionResult } from "./index.ts";
import { assertInvoiceXmlPreflight } from "./preflight.ts";

export class HardenedAadeMyDataClient extends BaseAadeMyDataClient {
  override async sendInvoices(xml: string): Promise<MyDataTransmissionResult> {
    assertInvoiceXmlPreflight(xml);
    return super.sendInvoices(xml);
  }
}
