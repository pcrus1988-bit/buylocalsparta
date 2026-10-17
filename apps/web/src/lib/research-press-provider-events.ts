/** Amazon SES feedback parser: untrusted input until the outer SNS signature has been verified. */
export type PressEventType = "delivered"|"bounced"|"complained"|"rejected"|"delivery_delayed"|"opened"|"clicked";
export type PressProviderEvent = Readonly<{
  sesMessageId:string; recipient:string; type:PressEventType;
  campaignId:string|null; occurredAt:string; detail:string|null;
}>;
const types:Record<string,PressEventType> = {
  Delivery:"delivered", Bounce:"bounced", Complaint:"complained", Reject:"rejected",
  DeliveryDelay:"delivery_delayed", Open:"opened", Click:"clicked"
};
const safeEmail=(v:unknown)=>typeof v==="string" && v.length<=254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v.toLowerCase():null;
const object=(value:unknown):Record<string,unknown>|null=>
  value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:null;
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const recipients=(value:unknown):string[]=>[...new Set(list(value)
  .map(v=>safeEmail(typeof v==="string"?v:object(v)?.emailAddress)).filter((v):v is string=>!!v))];
const validUuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseSesPressEvent(input:unknown):PressProviderEvent[] {
  const record=object(input);if(!record)return [];
  const rawType=record.eventType ?? record.notificationType;
  const type=typeof rawType==="string"?types[rawType]:undefined;
  if(!type)return [];
  const mail=object(record.mail);
  const sesMessageId=mail?.messageId;
  if(typeof sesMessageId!=="string"||!sesMessageId||sesMessageId.length>256)return [];
  const tag=object(mail.tags);
  const taggedCampaign=list(tag?.pressCampaign)[0];
  const campaignId=validUuid(taggedCampaign)?taggedCampaign:null;
  const section=object(record[
    type==="bounced"?"bounce":type==="complained"?"complaint":
    type==="delivered"?"delivery":type==="delivery_delayed"?"deliveryDelay":
    type==="rejected"?"reject":type==="opened"?"open":"click"
  ]) ?? {};
  const addresses=type==="bounced"?recipients(section.bouncedRecipients):
    type==="complained"?recipients(section.complainedRecipients):
    type==="delivery_delayed"?recipients(section.delayedRecipients):
    type==="delivered"?recipients(section.recipients):
    recipients(mail.destination);
  // Never attribute an event to a recipient not explicitly identified by SES.
  if(!addresses.length)return [];
  const time=section.timestamp ?? mail.timestamp;
  const timestamp=typeof time==="string"?Date.parse(time):NaN;
  const occurredAt=Number.isFinite(timestamp) && timestamp>0 && timestamp<Date.now()+86400000
    ?new Date(timestamp).toISOString():new Date().toISOString();
  const rawDetail=type==="bounced" ? section.bounceType:
    type==="complained"?section.complaintFeedbackType:
    type==="delivery_delayed"?section.delayType:
    type==="rejected"?section.reason:null;
  const detail=typeof rawDetail==="string"?rawDetail.slice(0,500):null;
  return addresses.map(recipient=>({sesMessageId,recipient,type,campaignId,occurredAt,detail}));
}
/** A single mutually exclusive outcome per recipient for sensible totals.
 * Complaint and bounce take precedence over earlier delivered feedback. */
export type PressDeliveryOutcome="complained"|"bounced"|"rejected"|"delivered"|"delivery_delayed"|"accepted_unconfirmed"|"pending"|"suppressed"|"held"|"failed";
export function pressDeliveryOutcome(status:string,types:ReadonlySet<PressEventType>):PressDeliveryOutcome {
  if(types.has("complained"))return "complained";
  if(types.has("bounced"))return "bounced";
  if(types.has("rejected"))return "rejected";
  if(types.has("delivered"))return "delivered";
  if(types.has("delivery_delayed"))return "delivery_delayed";
  if(status==="sent")return "accepted_unconfirmed";
  if(status==="sending")return "held";
  if(status==="suppressed")return "suppressed";
  if(status==="failed")return "failed";
  return "pending";
}
