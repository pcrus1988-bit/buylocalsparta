export type ColorStudioKey=
 "nails"|"lips"|"eyes"|"makeup"|"hair"|"shoes"|"bags"|"fashion"|"home";
export type ColorStudioDefinition=Readonly<{
 key:ColorStudioKey;categoryCode:string;title:string;english:string;
 description:string;icon:string;defaultHex:string
}>;
/** Mirrors the nine publicly supported Color Finder categories on KONTA MOY. */
export const COLOR_STUDIOS:readonly ColorStudioDefinition[]=[
 {key:"nails",categoryCode:"studio-nails",title:"Νύχια",english:"NAIL STUDIO",description:"Βερνίκια και χρώματα νυχιών",icon:"💅",defaultHex:"#B52E2E"},
 {key:"lips",categoryCode:"studio-lips",title:"Χείλη",english:"LIP STUDIO",description:"Κραγιόν και αποχρώσεις χειλιών",icon:"💋",defaultHex:"#B52E2E"},
 {key:"eyes",categoryCode:"studio-eye-makeup",title:"Μάτια",english:"EYE STUDIO",description:"Σκιές και μακιγιάζ ματιών",icon:"👁",defaultHex:"#806056"},
 {key:"makeup",categoryCode:"studio-makeup",title:"Μακιγιάζ",english:"MAKEUP STUDIO",description:"Τόνοι και αποχρώσεις προσώπου",icon:"✦",defaultHex:"#C79C88"},
 {key:"hair",categoryCode:"studio-hair-color",title:"Μαλλιά",english:"HAIR COLOR STUDIO",description:"Βαφές και χρώματα μαλλιών",icon:"✂",defaultHex:"#795649"},
 {key:"shoes",categoryCode:"studio-shoes",title:"Παπούτσια",english:"SHOE STUDIO",description:"Παπούτσια από το χρώμα τους",icon:"◈",defaultHex:"#19191B"},
 {key:"bags",categoryCode:"studio-bags",title:"Τσάντες & αξεσουάρ",english:"ACCESSORY STUDIO",description:"Τσάντες και αξεσουάρ στην παλέτα σου",icon:"▣",defaultHex:"#19191B"},
 {key:"fashion",categoryCode:"studio-fashion",title:"Μόδα",english:"FASHION STUDIO",description:"Ρούχα και χρωματικοί συνδυασμοί",icon:"◉",defaultHex:"#19191B"},
 {key:"home",categoryCode:"studio-home",title:"Σπίτι",english:"HOME COLOR STUDIO",description:"Αποχρώσεις για σπίτι και διακόσμηση",icon:"⌂",defaultHex:"#C4A68C"}
] as const;
export const COLOR_PRESETS:readonly {label:string;hex:string}[]=[
 {label:"Κερασί",hex:"#7A2538"},{label:"Κόκκινο",hex:"#B52E2E"},
 {label:"Ροζ",hex:"#D998A8"},{label:"Nude",hex:"#C79C88"},
 {label:"Κοραλλί",hex:"#E97668"},{label:"Μούρο",hex:"#8C3F5B"},
 {label:"Μόκα",hex:"#806056"},{label:"Μωβ",hex:"#67445F"},
 {label:"Μπλε",hex:"#28314E"},{label:"Πράσινο",hex:"#3F7959"},
 {label:"Χρυσό",hex:"#C1A064"},{label:"Μαύρο",hex:"#19191B"},
 {label:"Λευκό",hex:"#F5F3EB"}
];
export function studioForKey(key:unknown):ColorStudioDefinition|undefined{
 return typeof key==="string"?COLOR_STUDIOS.find(x=>x.key===key):undefined;
}
export function validColorHex(value:unknown):value is string{
 return typeof value==="string"&&/^#[A-Fa-f0-9]{6}$/.test(value);
}
export function normalizeColorHex(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const s=value.trim();
 return validColorHex(s)?s.toUpperCase():null;
}
export type StudioHsv={h:number;s:number;v:number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function hexToHsv(hex:string):StudioHsv{
 if(!validColorHex(hex))throw Error("INVALID_HEX");
 const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0;
 if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
 return {h:(h+360)%360,s:max===0?0:d/max*100,v:max*100};
}
export function hsvToHex(input:StudioHsv):string{
 const h=((Number.isFinite(input.h)?input.h:0)%360+360)%360;
 const s=clamp(Number.isFinite(input.s)?input.s:0,0,100)/100;
 const v=clamp(Number.isFinite(input.v)?input.v:0,0,100)/100;
 const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;
 const p=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return "#"+p.map(n=>Math.round((n+m)*255).toString(16).padStart(2,"0")).join("").toUpperCase();
}
export function tuneColor(hex:string,part:keyof StudioHsv,amount:number):string{
 const color=hexToHsv(hex);
 if(!Number.isFinite(amount)||Math.abs(amount)>360)throw Error("INVALID_STEP");
 return hsvToHex({...color,[part]:part==="h"?(color.h+amount+360)%360:clamp(color[part]+amount,0,100)});
}
