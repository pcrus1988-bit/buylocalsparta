import type {SessionPrincipal} from "@buy-local-sparta/core";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {getAdminPostgresRuntime} from "./postgres-runtime";

/** Live aggregate inventory, NOT a retention sweep or authority to erase records.
 * The retention matrix remains an unapproved proposal. Never show PII here.
 */
export type MaziRetentionInventory={
 awaiting_review:number; declined_interests:number; approved_interests:number;
 unused_invitations:number; verified_members:number;
 community_messages:number; community_threads:number;
 immutable_audit_rows:number; oldest_interest:Date|null; oldest_invitation:Date|null;
};
export async function maziRetentionInventory(principal:SessionPrincipal):Promise<MaziRetentionInventory>{
 await marketplaceMaziActor(principal);
 const result=await getAdminPostgresRuntime().nativePool.query<MaziRetentionInventory>(`
 SELECT
  (SELECT count(*)::int FROM public.mazi_interest_applications WHERE status IN ('pending_review','registry_review_required')) AS awaiting_review,
  (SELECT count(*)::int FROM public.mazi_interest_applications WHERE status='declined') AS declined_interests,
  (SELECT count(*)::int FROM public.mazi_interest_applications WHERE status='approved_pending_invite') AS approved_interests,
  (SELECT count(*)::int FROM public.mazi_invitations WHERE status<>'consumed') AS unused_invitations,
  (SELECT count(*)::int FROM public.mazi_members WHERE status='verified') AS verified_members,
  (SELECT count(*)::int FROM public.mazi_chat_messages) AS community_messages,
  (SELECT count(*)::int FROM public.mazi_forum_threads) AS community_threads,
  (SELECT count(*)::int FROM public.mazi_audit_events) AS immutable_audit_rows,
  (SELECT min(submitted_at) FROM public.mazi_interest_applications) AS oldest_interest,
  (SELECT min(issued_at) FROM public.mazi_invitations) AS oldest_invitation
 `);
 if(!result.rows[0])throw Error("MAZI_RETENTION_INVENTORY_UNAVAILABLE");
 return result.rows[0];
}

/** For lawyer/controller review, not implemented deletion deadlines. */
export const proposedMaziRetention=[
 ["Εκδήλωση ενδιαφέροντος χωρίς ένταξη","12 μήνες από την τελική απόφαση ή τελευταία ουσιαστική επαφή"],
 ["Προσκλήσεις που έληξαν/ανακλήθηκαν","90 ημέρες από τη λήξη ή ανάκληση"],
 ["Προφίλ πρώην μη οικονομικών μελών","24 μήνες από την τεκμηριωμένη λήξη, εκτός νόμιμων εξαιρέσεων"],
 ["Κοινότητα / μηνύματα","90 ημέρες μετά τη λήξη λογαριασμού ή νόμιμο αίτημα διαγραφής"],
 ["Αναφορές εποπτείας","12 μήνες από το κλείσιμο, εκτός διαφοράς/νομικού hold"],
 ["Αποδεικτικά ένταξης και ελεγκτικά ίχνη","Έως 3 έτη μετά το κλείσιμο: υπό νομικό έλεγχο"],
 ["Logs υποδομής","Προτεινόμενο 90ήμερο, ανάλογα με την πραγματική δυνατότητα των παρόχων"],
 ["Μελλοντικά φορολογικά/χρηματοδοτικά στοιχεία","Ειδική νόμιμη περίοδος, όχι αυτόματη εφαρμογή του πιλοτικού προγράμματος"]
] as const;
