export type MaziListing={
 id:string;member_user_id:string;kind:"offer"|"request";
 category:"goods"|"services"|"partnerships";
 title:string;description:string;status:"active"|"closed";
 created_at:string;author_business_name:string;is_mine:boolean
};
export type MaziForumThread={
 id:string;member_user_id:string;category:"general"|"advice"|"collaboration";
 title:string;body:string;locked:boolean;created_at:string;
 author_business_name:string;is_mine:boolean
};
export type MaziForumReply={
 id:string;thread_id:string;member_user_id:string;
 body:string;created_at:string;author_business_name:string;is_mine:boolean
};
export type MaziChatMessage={
 id:string;member_user_id:string;channel:"lobby";body:string;
 created_at:string;author_business_name:string;is_mine:boolean
};
export const listingCategories:Record<MaziListing["category"],string>={
 goods:"Προϊόντα",services:"Υπηρεσίες",partnerships:"Συνεργασίες"
};
export const listingKinds:Record<MaziListing["kind"],string>={
 offer:"Προσφορά",request:"Αναζήτηση"
};
export const forumCategories:Record<MaziForumThread["category"],string>={
 general:"Γενική συζήτηση",advice:"Συμβουλές",collaboration:"Συνεργασίες"
};
export const formattedDate=(value:string)=>new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens"});
