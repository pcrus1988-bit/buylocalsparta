/** Shared private-inquiry types. Existing public MAZI community APIs live in lib/mazi-community. */
export type CommunityInquiry={
 id:string;listing_id:string;sender_user_id:string;recipient_user_id:string;
 status:"open"|"closed";created_at:string
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
