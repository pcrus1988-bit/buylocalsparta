export const goodsCategories={equipment:"Εξοπλισμός & μηχανήματα",inventory:"Εμπορεύματα & απόθεμα",materials:"Πρώτες ύλες & υλικά",furniture:"Έπιπλα & εξοπλισμός χώρων",electronics:"Ηλεκτρονικά",packaging:"Συσκευασίες",vehicles:"Οχήματα & ανταλλακτικά",other:"Λοιπά φυσικά είδη"} as const;
export const goodsConditions={new:"Καινούργιο",used:"Μεταχειρισμένο",refurbished:"Ανακατασκευασμένο",any:"Οποιαδήποτε κατάσταση"} as const;
export const goodsUnits={piece:"τεμ.",set:"σετ",box:"κιβώτια",pallet:"παλέτες",kg:"κιλά",liter:"λίτρα"} as const;
export const goodsFulfillment={pickup:"Παραλαβή από τον χώρο",shipping:"Αποστολή",either:"Παραλαβή ή αποστολή"} as const;
export const goodsPriceTypes={fixed:"Ενδεικτική τιμή",negotiable:"Τιμή υπό διαπραγμάτευση",on_request:"Κατόπιν επικοινωνίας"} as const;
export const goodsVatBasis={included:"Με ΦΠΑ",excluded:"Χωρίς ΦΠΑ",unspecified:"ΦΠΑ προς διευκρίνιση"} as const;
export type MaziListing={
 id:string;member_user_id:string;kind:"offer"|"request";category:"goods";
 item_category:keyof typeof goodsCategories;item_condition:keyof typeof goodsConditions;
 quantity:number;quantity_unit:keyof typeof goodsUnits;location_city:string;
 fulfillment:keyof typeof goodsFulfillment;price_type:keyof typeof goodsPriceTypes;
 price_cents:number|null;price_vat_basis:keyof typeof goodsVatBasis;
 expires_at:string;title:string;description:string;status:"active"|"closed";
 created_at:string;author_business_name:string;is_mine:boolean
};
export const listingPrice=(item:MaziListing)=>{
 if(item.price_cents===null)return "Κατόπιν επικοινωνίας";
 const euro=(item.price_cents/100).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
 return euro+" · "+goodsVatBasis[item.price_vat_basis];
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
export const listingCategories:Record<MaziListing["category"],string>={goods:"Φυσικά είδη"};
export const listingKinds:Record<MaziListing["kind"],string>={
 offer:"Προσφορά",request:"Αναζήτηση"
};
export const forumCategories:Record<MaziForumThread["category"],string>={
 general:"Γενική συζήτηση",advice:"Συμβουλές",collaboration:"Συνεργασίες"
};
export const formattedDate=(value:string)=>new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens"});
