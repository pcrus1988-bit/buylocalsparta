import { AadeMyDataClient as BaseAadeMyDataClient, type MyDataTransmissionResult } from "./index.ts";
import { assertClassificationXmlPreflight } from "./classification-preflight.ts";
import { assertInvoiceXmlPreflight } from "./preflight.ts";

export class HardenedAadeMyDataClient extends BaseAadeMyDataClient {
  override async sendInvoices(xml: string): Promise<MyDataTransmissionResult> {
    assertInvoiceXmlPreflight(xml);
    assertClassificationXmlPreflight(xml);
    return super.sendInvoices(xml);
  }
}
