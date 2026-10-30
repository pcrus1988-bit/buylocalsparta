/** Navigation and panel labels stay in sync across the research results sidebar and workbench. */
export const RESULTS_EXPLORER_VIEWS = [
 {id:"chapters",number:"01",name:"Ερευνητικές ενότητες",nav:"Ερευνητικές ενότητες",detail:"6 κεφάλαια · 18 υποενότητες"},
 {id:"graphs",number:"02",name:"Graph Explorer",nav:"Γραφήματα & πίνακες",detail:"Γραφήματα & πίνακες"},
 {id:"map",number:"03",name:"Heatmap Ελλάδας",nav:"Heatmap Ελλάδας",detail:"Διαδραστικός χάρτης"},
 {id:"county",number:"04",name:"Νομός",nav:"Ανάλυση ανά νομό",detail:"Επιστημονική αναφορά ανά νομό"},
 {id:"voices",number:"05",name:"Η φωνή της Ελλάδας",nav:"Η φωνή της Ελλάδας",detail:"Q18 · Θεματικές & μαρτυρίες"}
] as const;

export type ResultsExplorerView = (typeof RESULTS_EXPLORER_VIEWS)[number]["id"];
export const resultsExplorerAnchor = (view:ResultsExplorerView)=>`research-workbench-${view}`;
export function readResultsExplorerHash(hash:string):ResultsExplorerView|null {
 return RESULTS_EXPLORER_VIEWS.find(view=>hash===`#${resultsExplorerAnchor(view.id)}`)?.id??null;
}
