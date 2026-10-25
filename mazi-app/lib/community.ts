import {maziMemberRequest} from "./mazi-api";
export type CommunityListing={id:string;member_user_id:string;kind:"offer"|"request";category:string;title:string;description:string;status:string;created_at:string};
export type CommunityThread={id:string;member_user_id:string;category:string;title:string;body:string;locked:boolean;created_at:string};
export type CommunityReply={id:string;thread_id:string;member_user_id:string;body:string;created_at:string};
export type CommunityChat={id:string;member_user_id:string;body:string;created_at:string};
export type CommunityInquiry={id:string;listing_id:string;sender_user_id:string;recipient_user_id:string;status:"open"|"closed";created_at:string};
export type CommunityInquiryMessage={id:string;inquiry_id:string;member_user_id:string;body:string;created_at:string};
export type CommunityInbox={inquiries:CommunityInquiry[];inquiry_messages:CommunityInquiryMessage[];listing_labels:Record<string,string>;businesses:Record<string,string>};
export type CommunitySnapshot={listings:CommunityListing[];threads:CommunityThread[];replies:CommunityReply[];messages:CommunityChat[];businesses:Record<string,string>};
export const getCommunity=(section:"dashboard"|"marketplace"|"forum"|"chat")=>
 maziMemberRequest<CommunitySnapshot>("community_snapshot",{section});
export const dateGR=(value:string)=>new Date(value).toLocaleDateString("el-GR",{day:"numeric",month:"short",year:"numeric"});
export const businessName=(names:Record<string,string>,id:string)=>names[id]||"Επαληθευμένο μέλος";
