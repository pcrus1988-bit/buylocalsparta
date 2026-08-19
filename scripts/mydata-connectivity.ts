import { AadeMyDataClient, myDataConfigFromEnv } from "@buy-local-sparta/aade-mydata";

const config = myDataConfigFromEnv(process.env);
const client = new AadeMyDataClient(config);
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Athens",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
const today = `${parts.day}/${parts.month}/${parts.year}`;
const xml = await client.requestMyIncome({ dateFrom: today, dateTo: today });

// Connectivity output is deliberately metadata-only: never print the AADE response body or credentials.
console.log(JSON.stringify({
  ok: true,
  readOnly: true,
  operation: "RequestMyIncome",
  environment: client.environment,
  specVersion: client.specVersion,
  responseBytes: Buffer.byteLength(xml, "utf8")
}));
