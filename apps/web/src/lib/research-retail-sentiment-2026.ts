import type { ResearchQuestion } from "./research-survey-model";

/**
 * Pre-pilot economic/sentiment extension. The original 0.2.0 instrument stays
 * intact; an Admin explicitly installs this into an editable draft revision.
 * Stable codes and analysis keys enable future waves to harmonise variables.
 */
export const RETAIL_SENTIMENT_2026_QUESTIONS: readonly Omit<ResearchQuestion, "id">[] = [
  {
    code: "Q19", sectionCode: "G", position: 20, type: "single", required: true,
    analysisKey: "business_optimism_12m",
    prompt: "Πόσο αισιόδοξος ή απαισιόδοξος αισθάνεστε για την πορεία της επιχείρησής σας τους επόμενους 12 μήνες;",
    config: { options: [
      ["very_pessimistic", "Πολύ απαισιόδοξος/η"],
      ["pessimistic", "Μάλλον απαισιόδοξος/η"],
      ["neutral", "Ούτε αισιόδοξος/η ούτε απαισιόδοξος/η"],
      ["optimistic", "Μάλλον αισιόδοξος/η"],
      ["very_optimistic", "Πολύ αισιόδοξος/η"],
      ["unknown", "Δεν γνωρίζω / δεν θέλω να απαντήσω"]
    ] }
  },
  {
    code: "Q20", sectionCode: "G", position: 21, type: "single", required: true,
    analysisKey: "investment_capacity_confidence_12m",
    prompt: "Πόσο πιθανό θεωρείτε ότι η επιχείρησή σας θα μπορέσει να χρηματοδοτήσει τις αναγκαίες επενδύσεις της τους επόμενους 12 μήνες;",
    config: { options: [
      ["very_unlikely", "Καθόλου πιθανό"],
      ["unlikely", "Μάλλον απίθανο"],
      ["neutral", "Ούτε πιθανό ούτε απίθανο"],
      ["likely", "Μάλλον πιθανό"],
      ["very_likely", "Πολύ πιθανό"],
      ["unknown", "Δεν γνωρίζω / δεν θέλω να απαντήσω"]
    ] }
  },
  {
    code: "Q21", sectionCode: "G", position: 22, type: "matrix", required: true,
    analysisKey: "business_financial_trends_12m",
    prompt: "Σε σύγκριση με τους προηγούμενους 12 μήνες, πώς έχουν μεταβληθεί τα παρακάτω στην επιχείρησή σας;",
    help: "Αναφερόμαστε στην τελευταία περίοδο 12 μηνών και όχι σε προβλέψεις. Δεν ζητούνται ποσά.",
    config: {
      items: [
        ["turnover", "Κύκλος εργασιών / πωλήσεις"],
        ["operating_costs", "Λειτουργικά έξοδα"],
        ["profitability", "Κερδοφορία"]
      ],
      scale: [
        ["decreased", "Μειώθηκαν"], ["stable", "Έμειναν σταθερά"],
        ["increased", "Αυξήθηκαν"], ["unknown", "Δεν γνωρίζω"],
        ["prefer_not", "Δεν απαντώ"]
      ]
    }
  },
  {
    code: "Q22", sectionCode: "G", position: 23, type: "matrix", required: true,
    analysisKey: "ecommerce_attitudes",
    prompt: "Σε ποιο βαθμό συμφωνείτε με τις παρακάτω απόψεις για το ηλεκτρονικό εμπόριο σε μια επιχείρηση όπως η δική σας;",
    help: "Αξιολογήστε κάθε πρόταση ανεξάρτητα· δεν υπάρχει σωστή απάντηση.",
    config: {
      items: [
        ["opportunity", "Προσφέρει μια σημαντική ευκαιρία ανάπτυξης"],
        ["necessity", "Είναι αναγκαίο για να παραμείνει ανταγωνιστική"],
        ["unjustifiable_cost", "Το κόστος του δεν δικαιολογείται για την επιχείρησή μας"],
        ["physical_complement", "Μπορεί να συμπληρώσει θετικά τις πωλήσεις στο φυσικό κατάστημα"]
      ],
      scale: [
        ["1", "Διαφωνώ απόλυτα"], ["2", "Διαφωνώ"], ["3", "Ούτε/ούτε"],
        ["4", "Συμφωνώ"], ["5", "Συμφωνώ απόλυτα"],
        ["unknown", "Δεν γνωρίζω"]
      ]
    }
  },
  {
    code: "Q23", sectionCode: "G", position: 24, type: "matrix", required: true,
    analysisKey: "marketplace_reported_consequences",
    prompt: "Από τη χρήση marketplaces, πώς εκτιμάτε ότι μεταβλήθηκαν τα παρακάτω;",
    help: "Απαντήστε με βάση την εμπειρία σας, ακόμη κι αν δεν χρησιμοποιείτε πλέον πλατφόρμα. Η απάντηση δεν αποδεικνύει αιτιότητα.",
    config: {
      showWhen: { code: "Q13", operator: "in", values: ["current", "past"] },
      items: [
        ["profitability", "Κερδοφορία"],
        ["customer_reach", "Πρόσβαση σε νέους πελάτες"],
        ["platform_dependence", "Εξάρτηση από τρίτες πλατφόρμες"]
      ],
      scale: [
        ["large_decrease", "Μειώθηκε πολύ"], ["decrease", "Μειώθηκε"],
        ["same", "Δεν άλλαξε"], ["increase", "Αυξήθηκε"],
        ["large_increase", "Αυξήθηκε πολύ"], ["unknown", "Δεν γνωρίζω"]
      ]
    }
  },
  {
    code: "Q24", sectionCode: "G", position: 25, type: "multi", required: true,
    analysisKey: "first_online_sale_barriers",
    prompt: "Ποιοι είναι οι κυριότεροι λόγοι που η επιχείρησή σας δεν πραγματοποιεί ακόμη online πωλήσεις;",
    help: "Επιλέξτε έως 3 λόγους.",
    config: {
      showWhen: { code: "Q04", operator: "in", values: ["0"] },
      max: 3,
      options: [
        ["setup_cost", "Κόστος έναρξης"], ["ongoing_cost", "Συνεχές λειτουργικό κόστος"],
        ["technical_skills", "Έλλειψη τεχνικών γνώσεων"], ["staff", "Έλλειψη προσωπικού"],
        ["time", "Έλλειψη χρόνου"], ["uncertain_demand", "Αβέβαιη ζήτηση"],
        ["shipping", "Δυσκολίες στις αποστολές"], ["commissions", "Προμήθειες πλατφορμών"],
        ["no_need", "Δεν υπάρχει ανάγκη για online πωλήσεις"],
        ["other", "Άλλος λόγος"], ["none", "Κανένας από αυτούς"]
      ]
    }
  },
  {
    code: "Q25", sectionCode: "G", position: 26, type: "single", required: true,
    analysisKey: "online_presence_local_store_impact",
    prompt: "Κατά την εκτίμησή σας, η online παρουσία της επιχείρησης έχει επηρεάσει τις επισκέψεις ή αγορές στο φυσικό κατάστημά σας;",
    config: { options: [
      ["increased_lot", "Τις έχει αυξήσει σημαντικά"],
      ["increased_some", "Τις έχει αυξήσει λίγο"],
      ["unchanged", "Δεν διαπιστώνουμε αλλαγή"],
      ["decreased", "Τις έχει μειώσει"],
      ["unknown", "Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"],
      ["no_presence", "Δεν έχουμε ουσιαστική online παρουσία"],
      ["no_physical_store", "Δεν διαθέτουμε φυσικό κατάστημα"]
    ] }
  },
  {
    code: "Q26", sectionCode: "G", position: 27, type: "single", required: true,
    analysisKey: "online_presence_expected_local_impact",
    prompt: "Αν αποκτούσατε ουσιαστική online παρουσία, πιστεύετε ότι θα βοηθούσε τις επισκέψεις ή αγορές στο φυσικό κατάστημα;",
    config: {
      showWhen: { code: "Q25", operator: "in", values: ["no_presence"] },
      options: [
        ["yes_lot", "Ναι, σημαντικά"], ["yes_some", "Ναι, λίγο"],
        ["no_change", "Όχι ιδιαίτερα"], ["negative", "Θα μπορούσε να τις μειώσει"],
        ["unknown", "Δεν γνωρίζω"]
      ]
    }
  },
  {
    code: "Q27", sectionCode: "G", position: 28, type: "multi", required: true,
    analysisKey: "economic_viability_pressures",
    prompt: "Ποιοι οικονομικοί παράγοντες επιβαρύνουν περισσότερο σήμερα τη βιωσιμότητα της επιχείρησής σας;",
    help: "Επιλέξτε έως 3.",
    config: {
      max: 3,
      options: [
        ["purchasing_power", "Μειωμένη αγοραστική δύναμη καταναλωτών"],
        ["suppliers", "Αύξηση τιμών προμηθευτών"],
        ["energy", "Κόστος ενέργειας"], ["rent", "Ενοίκιο"],
        ["wages", "Μισθολογικό κόστος"], ["taxation", "Φορολογία / εισφορές"],
        ["liquidity", "Ρευστότητα / πρόσβαση σε χρηματοδότηση"],
        ["competition", "Ανταγωνισμός και πιέσεις στις τιμές"],
        ["other", "Άλλος παράγοντας"], ["none", "Κανένας από τους παραπάνω"]
      ]
    }
  }
];

/** Draft-only preregistration; score requires all three components. */
export function withRetailConfidencePreregistration(
  plan: Record<string, unknown>,
  instrumentVersion: string
): Record<string, unknown> {
  const originals = Array.isArray(plan.primaryOutcomes) ? plan.primaryOutcomes : [];
  return {
    ...plan,
    instrumentVersion,
    primaryOutcomes: [
      ...originals.filter((item) => (item as { metricKey?: unknown })?.metricKey !== "retail_confidence.mean"),
      {
        metricKey: "retail_confidence.mean",
        label: "Greek Retail Business Confidence Index",
        estimand: "weighted_population_mean",
        segments: ["overall", "regionCode", "sectorCode"]
      }
    ],
    confidenceIndex: {
      schema: "greek-retail-confidence-v1",
      metricKey: "retail_confidence.mean",
      components: [
        { question: "Q19", concept: "business_optimism", weight: 1 / 3 },
        { question: "Q17", concept: "sales_expectation", weight: 1 / 3 },
        { question: "Q20", concept: "investment_capacity_confidence", weight: 1 / 3 }
      ],
      coding: "Each ordered 5-level response is mapped to 0,25,50,75,100. Uncertain midpoint=50. Unknown / prefer not to answer is missing.",
      missingness: "Complete-case: all three components required; no imputation or weight redistribution.",
      estimand: "Survey-weighted population mean of respondent 0-100 scores; uncertainty follows the same preregistered stratified variance method.",
      interpretation: "Merchant self-reported confidence; associations do not imply causality.",
      preliminaryPilotEstimates: "not_publishable_as_population_estimates"
    },
    prespecifiedEconomicAnalyses: {
      financialTrends: "Q21 turnover/operating_costs/profitability joint distributions (especially turnover increased AND profitability decreased)",
      ecommerceAttitudes: "Q22 four separate ordinal distributions; no forced single attitude category",
      marketplaceExperience: "Q23 only among Q13 current/past sellers; compare each consequence separately",
      firstOnlineSaleBarriers: "Q24 only when Q04=0",
      localVisibility: "Q25 reported experience versus Q26 expectation when Q25=no_presence",
      viabilityPressures: "Q27 multi-response shares",
      subgroupVariables: ["regionCode", "sectorCode", "sizeBand"],
      municipalityComparisons: "exploratory_only_if_verified_geography_and_sufficient_base"
    }
  };
}
