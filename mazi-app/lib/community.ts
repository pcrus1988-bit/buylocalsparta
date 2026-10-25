/** Shared private-inquiry types. Existing public MAZI community APIs live in lib/mazi-community. */
export type CommunityInquiry={
 id:string;listing_id:string;sender_user_id:string;recipient_user_id:string;
 status:"open"|"closed";created_at:string;last_message_at:string|null;
 last_message_user_id:string|null;sender_last_read_at:string|null;
 recipient_last_read_at:string|null;closed_at:string|null
};
export type CommunityInquiryMessage={
 id:string;inquiry_id:string;member_user_id:string;body:string;created_at:string
};
export type CommunityInbox={
 inquiries:CommunityInquiry[];
 inquiry_messages:CommunityInquiryMessage[];
 listing_labels:Record<string,string>;
 businesses:Record<string,string>
};

/** Unread is calculated from persistent, database-tracked last message timestamps. */
export function isInquiryUnread(inquiry:CommunityInquiry,userId:string):boolean{
 if(!inquiry.last_message_at||inquiry.last_message_user_id===userId)return false;
 if(inquiry.sender_user_id!==userId&&inquiry.recipient_user_id!==userId)return false;
 const lastRead=inquiry.sender_user_id===userId?
  inquiry.sender_last_read_at:inquiry.recipient_last_read_at;
 const latest=Date.parse(inquiry.last_message_at);
 return Number.isFinite(latest)&&(!lastRead||latest>Date.parse(lastRead));
}
