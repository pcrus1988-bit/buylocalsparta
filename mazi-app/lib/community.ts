import {maziMemberRequest} from "./mazi-api";
export type CommunityListing={id:string;member_user_id:string;kind:"offer"|"request";category:string;title:string;description:string;status:string;created_at:string};
export type CommunityThread={id:string;member_user_id:string;category:string;title:string;body:string;locked:boolean;created_at:string};
export type CommunityReply={id:string;thread_id:string;member_user_id:string;body:string;created_at:string};
export type CommunityChat={id:string;member_user_id:string;body:string;created_at:string};
export type CommunitySnapshot={listings:CommunityListing[];threads:CommunityThread[];replies:CommunityReply[];messages:CommunityChat[];businesses:Record<string,string>};
export const getCommunity=(section:"dashboard"|"marketplace"|"forum"|"chat")=>
 maziMemberRequest<CommunitySnapshot>("community_snapshot",{section});
export const dateGR=(value:string)=>new Date(value).toLocaleDateString("el-GR",{day:"numeric",month:"short",year:"numeric"});
export const businessName=(names:Record<string,string>,id:string)=>names[id]||"Επαληθευμένο μέλος";
