import { AadeMyDataClient, myDataConfigFromEnv } from "@buy-local-sparta/aade-mydata";

function aadeDate(date:Date):string {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const value=Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
  return `${value.day}/${value.month}/${value.year}`;
}

const config=myDataConfigFromEnv(process.env);
const client=new AadeMyDataClient(config);
const today=aadeDate(new Date());
const xml=await client.requestTransmittedDocs({mark:"0",dateFrom:today,dateTo:today});
console.log(JSON.stringify({ok:true,operation:"RequestTransmittedDocs",readOnly:true,environment:client.environment,specVersion:client.specVersion,responseBytes:Buffer.byteLength(xml,"utf8")}));
