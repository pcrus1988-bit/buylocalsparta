export const SPORT_ACTIVITIES=[
 {key:"running",label:"Τρέξιμο",icon:"↗"},
 {key:"walking",label:"Περπάτημα",icon:"→"},
 {key:"gym",label:"Γυμναστήριο",icon:"＋"},
 {key:"football",label:"Ποδόσφαιρο",icon:"⚽"},
 {key:"hiking",label:"Πεζοπορία",icon:"△"},
 {key:"basketball",label:"Μπάσκετ",icon:"●"},
 {key:"tennis",label:"Τένις",icon:"◉"},
 {key:"padel",label:"Padel",icon:"◇"},
 {key:"volleyball",label:"Βόλεϊ",icon:"○"},
 {key:"handball",label:"Χάντμπολ",icon:"◐"},
 {key:"badminton",label:"Μπάντμιντον",icon:"⌁"}
] as const;
export type SportActivity=(typeof SPORT_ACTIVITIES)[number]["key"];
export type SportAnswers={
 activity:SportActivity;audience:"men"|"women"|"kids";size?:string;footLengthMm?:number;
 budgetMinor?:number;surface?:string;frequency?:string;distance?:string;
 priority?:string;runnerNeed?:string;fitPreference?:string;gymTrainingType?:string;useCase?:string
};
export type SportChoice={value:string;label:string};
export type SportQuestionKey="activity"|"audience"|"size"|"footLength"|"surface"|"gymTraining"|
 "useCase"|"frequency"|"distance"|"runnerNeed"|"fit"|"priority"|"budget";
export type SportQuestion={key:SportQuestionKey;title:string;options:readonly SportChoice[];optional?:boolean};
const CHOICES={
 audience:[["men","Άνδρας"],["women","Γυναίκα"],["kids","Παιδί"]],
 frequency:[["light","1–2 φορές / εβδομάδα"],["regular","3–4 φορές"],["high","5+ φορές"]],
 distance:[["short","Έως 5 km"],["medium","5–10 km"],["long","10+ km"]],
 fit:[["standard","Κανονική"],["wide","Φαρδιά"],["narrow","Στενή"]],
 priority:[["comfort","Άνεση"],["cushioning","Απορρόφηση"],["lightweight","Ελαφρύ"],
  ["stability","Σταθερότητα"],["versatility","Πολυχρηστικότητα"],["traction","Πρόσφυση"],["weather","Προστασία από καιρό"]],
 runnerNeed:[["neutral","Ουδέτερη αίσθηση"],["guided_support","Στήριξη"],["wide_fit","Φαρδιά εφαρμογή"],
  ["soft_ride","Μαλακή κύλιση"],["speed","Ταχύτητα"],["all_rounder","All-round"]],
 gymTraining:[["strength","Βάρη"],["functional","Functional"],["cardio","Cardio"],
  ["treadmill","Διάδρομος"],["mixed","Μικτή"]],
 surface:{
  running:[["road","Άσφαλτος"],["treadmill","Διάδρομος"],["trail","Χώμα / trail"],["mixed","Μικτή"]],
  walking:[["road","Άσφαλτος"],["trail","Μονοπάτι"],["mixed","Μικτή"]],
  gym:[["indoor","Εσωτερικό γυμναστήριο"],["treadmill","Διάδρομος"]],
  football:[["grass","Φυσικό χόρτο"],["artificial","Συνθετικό χόρτο"],["indoor","Κλειστό"]],
  hiking:[["trail","Μονοπάτι"],["mixed","Μικτή διαδρομή"]],
  basketball:[["court_indoor","Indoor"],["court_outdoor","Outdoor"]],
  tennis:[["court_hard","Hard court"],["court_clay","Clay"],["court_indoor","Indoor"]],
  padel:[["court_artificial","Συνθετικό court"],["court_indoor","Indoor"],["court_outdoor","Outdoor"]],
  volleyball:[["court_indoor","Indoor"],["sand","Άμμος"],["court_outdoor","Outdoor"]],
  handball:[["court_indoor","Indoor"],["court_outdoor","Outdoor"]],
  badminton:[["court_indoor","Indoor"],["court_outdoor","Outdoor"]]
 },
 useCase:{
  running:[["daily_training","Καθημερινή προπόνηση"],["easy_run","Χαλαρό τρέξιμο"],
    ["long_run","Μεγάλη απόσταση"],["speed_training","Ταχύτητα"],["race_day","Αγώνας"],["recovery_run","Recovery"]],
  walking:[["daily_walking","Καθημερινό περπάτημα"],["all_day_standing","Ορθοστασία"],["travel_walking","Ταξίδι"]],
  gym:[["gym_strength","Βάρη"],["gym_cardio","Cardio"],["gym_functional","Functional"]],
  football:[["football_training","Προπόνηση"],["football_match","Αγώνας"]],
  hiking:[["day_hike","Ημερήσια πεζοπορία"],["technical_hike","Δύσκολη πεζοπορία"],["urban_outdoor","Urban"]],
  basketball:[["basketball_training","Προπόνηση"],["basketball_match","Αγώνας"]],
  tennis:[["tennis_training","Προπόνηση"],["tennis_match","Αγώνας"]],
  padel:[["padel_training","Προπόνηση"],["padel_match","Αγώνας"]],
  volleyball:[["volleyball_training","Προπόνηση"],["volleyball_match","Αγώνας"]],
  handball:[["handball_training","Προπόνηση"],["handball_match","Αγώνας"]],
  badminton:[["badminton_training","Προπόνηση"],["badminton_match","Αγώνας"]]
 }
} as const;
function pairs(p:readonly (readonly [string,string])[]):SportChoice[]{return p.map(([value,label])=>({value,label}));}
export function sportQuestionSequence(activity:SportActivity):readonly SportQuestionKey[]{
 const basics:SportQuestionKey[]=["activity","audience","size","footLength"];
 if(activity==="gym")return [...basics,"gymTraining","frequency","fit","priority","budget"];
 const extended:SportQuestionKey[]=["surface","useCase","frequency"];
 if(activity==="running")extended.push("distance","runnerNeed");
 else if(activity==="walking")extended.push("distance");
 return [...basics,...extended,"fit","priority","budget"];
}
export function sportQuestion(activity:SportActivity,key:SportQuestionKey):SportQuestion{
 if(key==="activity")return {key,title:"Τι άθλημα σε ενδιαφέρει;",options:SPORT_ACTIVITIES.map(x=>({value:x.key,label:x.label}))};
 if(key==="audience")return {key,title:"Για ποιον ψάχνουμε;",options:pairs(CHOICES.audience)};
 if(key==="size")return {key,title:"Τι μέγεθος EU φοράς;",options:[],optional:true};
 if(key==="footLength")return {key,title:"Μήκος πέλματος (mm), αν το γνωρίζεις",options:[],optional:true};
 if(key==="budget")return {key,title:"Μέγιστο budget (€)",options:[],optional:true};
 if(key==="surface")return {key,title:activity==="football"?"Σε τι γήπεδο παίζεις;":"Ποια είναι η επιφάνεια;",options:pairs(CHOICES.surface[activity])};
 if(key==="gymTraining")return {key,title:"Τι προπόνηση κάνεις;",options:pairs(CHOICES.gymTraining)};
 if(key==="useCase")return {key,title:"Ποια είναι η βασική χρήση;",options:pairs(CHOICES.useCase[activity])};
 if(key==="frequency")return {key,title:"Πόσο συχνά;",options:pairs(CHOICES.frequency)};
 if(key==="distance")return {key,title:"Πόση απόσταση;",options:pairs(CHOICES.distance)};
 if(key==="runnerNeed")return {key,title:"Ποια είναι η ανάγκη σου;",options:pairs(CHOICES.runnerNeed)};
 if(key==="fit")return {key,title:"Πώς θέλεις να εφαρμόζει;",options:pairs(CHOICES.fit)};
 return {key,title:"Τι έχει σημασία περισσότερο;",options:pairs(CHOICES.priority)};
}
export function applySportAnswer(input:SportAnswers,key:SportQuestionKey,value:string):SportAnswers{
 const clean=value.trim();
 if(key!=="activity"&&!sportQuestionSequence(input.activity).includes(key))throw Error("INAPPLICABLE_QUESTION");
 if(key==="activity"){
  if(!SPORT_ACTIVITIES.some(x=>x.key===clean))throw Error("INVALID_ACTIVITY");
  return {activity:clean as SportActivity,audience:input.audience};
 }
 if(key==="size"){
  if(clean&&!/^(?:EU\s*)?\d{2}(?:[.,]5)?$/.test(clean))throw Error("INVALID_SIZE");
  if(clean){const eu=Number(clean.replace(/^EU\s*/,"").replace(",","."));if(eu<20||eu>55)throw Error("INVALID_SIZE");}
  return {...input,size:clean?clean.replace(",","."):undefined};
 }
 if(key==="footLength"){
  const valueMm=Number(clean);
  if(clean&&(!Number.isFinite(valueMm)||valueMm<80||valueMm>400))throw Error("INVALID_FOOT_LENGTH");
  return {...input,footLengthMm:clean?Math.round(valueMm*10)/10:undefined};
 }
 if(key==="budget"){
  const euros=Number(clean.replace(",","."));
  if(clean&&(!Number.isFinite(euros)||euros<=0||euros>5000))throw Error("INVALID_BUDGET");
  return {...input,budgetMinor:clean?Math.round(euros*100):undefined};
 }
 const choices=sportQuestion(input.activity,key).options;
 if(!choices.some(x=>x.value===clean))throw Error("INVALID_CHOICE");
 const prop:Record<string,keyof SportAnswers>={audience:"audience",surface:"surface",gymTraining:"gymTrainingType",
  useCase:"useCase",frequency:"frequency",distance:"distance",runnerNeed:"runnerNeed",fit:"fitPreference",priority:"priority"};
 return {...input,[prop[key]]:clean};
}
export function sportAnswerPayload(input:SportAnswers):SportAnswers{
 if(!SPORT_ACTIVITIES.some(x=>x.key===input.activity))throw Error("INVALID_ACTIVITY");
 if(!["men","women","kids"].includes(input.audience))throw Error("INVALID_AUDIENCE");
 const checked:SportAnswers={activity:input.activity,audience:input.audience};
 for(const key of sportQuestionSequence(input.activity)){
  if(key==="activity"||key==="audience")continue;
  const prop:Record<string,keyof SportAnswers>={size:"size",footLength:"footLengthMm",budget:"budgetMinor",surface:"surface",
    gymTraining:"gymTrainingType",useCase:"useCase",frequency:"frequency",distance:"distance",
    runnerNeed:"runnerNeed",fit:"fitPreference",priority:"priority"};
  const actual=input[prop[key]];
  if(actual===undefined)continue;
  const display=key==="budget"?String((actual as number)/100):String(actual);
  Object.assign(checked,applySportAnswer(checked,key,display));
 }
 return checked;
}
