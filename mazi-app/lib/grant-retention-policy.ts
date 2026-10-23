/**
 * MAZI non-repayable development support: proposed future commercial policy.
 * This is a pure calculation contract, not a payment, contract execution,
 * automatic grant approval, collection, clawback or active membership lock.
 *
 * Values are integer cents to prevent floating-point term rounding errors.
 * Contract version must be captured separately at needs submission AND at
 * later disbursement request. Neither acknowledgement activates funding.
 */
export const MAZI_RETENTION_POLICY_VERSION = "mazi-grant-retention-v1" as const;
export const MAZI_MEMBERSHIP_MONTHLY_CENTS = 25_000 as const;
export const MAZI_RETENTION_SHARE_PERCENT = 40 as const;
export const MAZI_MONTHLY_GRANT_BASIS_CENTS =
  MAZI_MEMBERSHIP_MONTHLY_CENTS * MAZI_RETENTION_SHARE_PERCENT / 100; // €100
export const MAZI_MIN_CANCEL_NOTICE_DAYS = 10 as const;

function validAmountCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function parseDate(value: string): Date {
  if (!validDate(value)) throw new RangeError("Invalid civil date");
  return new Date(value + "T00:00:00.000Z");
}
function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function daysInUtcMonth(y: number, m: number) {
  return new Date(Date.UTC(y,m+1,0)).getUTCDate();
}

/** Monetary formula exactly as proposed: ceil(requested_euros / 100). */
export function grantCommitmentMonths(requestedAmountCents: number): number {
  if (!validAmountCents(requestedAmountCents)) throw new RangeError("Invalid requested grant amount");
  const months = Math.ceil(requestedAmountCents / MAZI_MONTHLY_GRANT_BASIS_CENTS);
  if (!Number.isSafeInteger(months)) throw new RangeError("Commitment months out of range");
  return months;
}

/** First day of eligibility after 80% of whole commitment months. */
export function monthsBeforeRepeatApplication(additionalMonths: number): number {
  if (!Number.isSafeInteger(additionalMonths) || additionalMonths < 1)
    throw new RangeError("Invalid commitment months");
  // ceil(months*4/5) avoids multiplication overflow for very large inputs.
  return Math.ceil(additionalMonths / 5 * 4);
}

/**
 * Add calendar months (not fixed 30-day intervals).
 * Preserve end-of-month when the anchor was the last day of its month.
 */
export function addCalendarMonths(date: string, months: number): string {
  const d = parseDate(date);
  if (!Number.isSafeInteger(months) || months < 0 || months > 120_000)
    throw new RangeError("Invalid calendar months");
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const target = new Date(Date.UTC(y,m + months,1));
  if (Number.isNaN(target.getTime())) throw new RangeError("Date out of range");
  const endOfMonth = day === daysInUtcMonth(y,m);
  target.setUTCDate(endOfMonth
    ? daysInUtcMonth(target.getUTCFullYear(),target.getUTCMonth())
    : Math.min(day, daysInUtcMonth(target.getUTCFullYear(),target.getUTCMonth())));
  return dateString(target);
}

function maxCivilDate(a: string, b: string) { return a >= b ? a : b; }

export type GrantCommitmentProjection = {
  policyVersion: typeof MAZI_RETENTION_POLICY_VERSION;
  requestedAmountCents: number;
  monthlyBasisCents: typeof MAZI_MONTHLY_GRANT_BASIS_CENTS;
  additionalMonths: number;
  periodStart: string;
  committedThrough: string;
  earliestRepeatApplicationDate: string;
  repeatApplicationDelayMonths: number;
  /** Not a cash charge: illustrates total fee exposure if €250/month remained unchanged. */
  illustrativeFeeCommitmentCents: number;
};

/**
 * Pure projection only. A commitment only arises upon a separately accepted
 * lawful grant agreement and actual disbursement. 'periodStart' must be
 * supplied by a future verified grant service (not the browser).
 *
 * If previous grants impose a longer term, the later start date is used, so
 * awards cannot satisfy the same additional months concurrently.
 */
export function projectGrantCommitment(
  requestedAmountCents: number,
  disbursementDate: string,
  existingCommitmentThrough?: string
): GrantCommitmentProjection {
  parseDate(disbursementDate);
  if (existingCommitmentThrough) parseDate(existingCommitmentThrough);
  const additionalMonths = grantCommitmentMonths(requestedAmountCents);
  const periodStart = existingCommitmentThrough
    ? maxCivilDate(disbursementDate,existingCommitmentThrough)
    : disbursementDate;
  return {
    policyVersion: MAZI_RETENTION_POLICY_VERSION,
    requestedAmountCents,
    monthlyBasisCents: MAZI_MONTHLY_GRANT_BASIS_CENTS,
    additionalMonths,
    periodStart,
    committedThrough: addCalendarMonths(periodStart,additionalMonths),
    repeatApplicationDelayMonths: monthsBeforeRepeatApplication(additionalMonths),
    earliestRepeatApplicationDate: addCalendarMonths(
      periodStart,monthsBeforeRepeatApplication(additionalMonths)
    ),
    illustrativeFeeCommitmentCents: additionalMonths * MAZI_MEMBERSHIP_MONTHLY_CENTS
  };
}

/** First-ever request is prioritized at submission, regardless of award outcome. */
export function firstTimeSupportRequest(previousRequestsByLegalEntity: number): boolean {
  if (!Number.isSafeInteger(previousRequestsByLegalEntity) || previousRequestsByLegalEntity < 0)
    throw new RangeError("Invalid historical request count");
  return previousRequestsByLegalEntity === 0;
}

/** Only actually disbursed grants impose the special reapplication cooldown. */
export function canApplyAfterGrant(
  asOfDate: string, lastDisbursedGrant: GrantCommitmentProjection | null
): boolean {
  parseDate(asOfDate);
  return !lastDisbursedGrant ||
    asOfDate >= lastDisbursedGrant.earliestRepeatApplicationDate;
}

/** Month-end cancellation with a 10-calendar-day notice, Greece-local dates. */
export function cancellationDeadlineForMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError("Invalid month");
  const first = parseDate(month+"-01");
  const last = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));
  last.setUTCDate(last.getUTCDate()-MAZI_MIN_CANCEL_NOTICE_DAYS);
  return dateString(last);
}
export function earliestMembershipCancellationEnd(
  noticeReceivedOn: string, committedThrough?: string
): string {
  const notice = parseDate(noticeReceivedOn);
  if (committedThrough) parseDate(committedThrough);
  const month0=noticeReceivedOn.slice(0,7);
  const month = noticeReceivedOn <= cancellationDeadlineForMonth(month0)
    ? month0 : addCalendarMonths(month0+"-01",1).slice(0,7);
  let due = addCalendarMonths(month+"-01",1);
  // 'due' represents first day of next month; convert to last day of target.
  function previousDay(s: string) {
    const d=parseDate(s);d.setUTCDate(d.getUTCDate()-1);return dateString(d);
  }
  let end=previousDay(due);
  if(committedThrough && end < committedThrough) {
    const bindingMonth=committedThrough.slice(0,7);
    const bindingEnd=previousDay(addCalendarMonths(bindingMonth+"-01",1));
    end=maxCivilDate(end,bindingEnd);
  }
  return end;
}
