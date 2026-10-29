/** Internal MAZI processor evidence review cadence (NOT a statutory GDPR period).
 * A stale recorded claim no longer unlocks legal or invitation release.
 */
export const MAZI_PROCESSOR_REVIEW_MAX_AGE_DAYS=90;
const DAY=86_400_000;
const validDay=(value:string):number|null=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const parsed=Date.parse(value+"T00:00:00.000Z");
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value)return null;
 return parsed;
};
export function maziAthensTodayISO():string{
 return new Intl.DateTimeFormat("sv-SE",{
  timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"
 }).format(new Date());
}
export function isMaziProcessorReviewFresh(
 reviewedOn:string,todayISO:string=maziAthensTodayISO()
):boolean{
 const reviewed=validDay(reviewedOn),today=validDay(todayISO);
 return reviewed!==null&&today!==null&&reviewed<=today&&
  (today-reviewed)/DAY<=MAZI_PROCESSOR_REVIEW_MAX_AGE_DAYS;
}
