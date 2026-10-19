/** Recovery rules for optimistic session commands. Never replay on a new session. */
export type RecoverableSessionAction =
  "start"|"pause"|"resume"|"crash"|"end"|"create_screen"|"create_table"|"revoke_pass"|"set_screen_feed";
export type RecoverableSessionState = "running"|"paused"|"crashing"|"ended"|"scheduled";
export type SessionRecoveryDecision = "retry"|"already_applied"|"review";

/**
 * A timed-out crash is a clock-driven state change, not a manager command.
 * Keep the user-command revision unchanged when clearing the crash timer,
 * otherwise GET can report the old revision while every POST increments it
 * again and rejects the request forever.
 *
 * The session table remains locked by the parent venue transaction.
 */
export const EXPIRE_DRINKSTOCK_CRASH_SQL = `
UPDATE public.drinkstock_sessions SET state='running',crash_until=NULL
WHERE venue_id=$1::uuid AND partner_id=$2::uuid
  AND state='crashing' AND crash_until<=now()
`;

export function decideSessionRevisionRecovery(
 action:RecoverableSessionAction,
 priorSessionId:string|null,
 current:{id:string;state:RecoverableSessionState}|null
):SessionRecoveryDecision {
 if(priorSessionId!==(current?.id??null))return "review";
 const state=current?.state??"none";
 if((action==="pause"&&state==="paused") ||
    (action==="resume"&&state==="running") ||
    (action==="end"&&state==="ended"))return "already_applied";
 if(action==="start")return state==="none"||state==="ended"?"retry":"review";
 if(action==="pause")return state==="running"||state==="crashing"?"retry":"review";
 if(action==="resume")return state==="paused"?"retry":"review";
 if(action==="crash")return state==="running"?"retry":"review";
 if(action==="end")return ["running","paused","crashing","scheduled"].includes(state)?"retry":"review";
 // Pass/TV settings do not change the trading session itself.
 return "retry";
}
