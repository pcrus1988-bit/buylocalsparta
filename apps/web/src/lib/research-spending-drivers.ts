import { externalGroup, type ExternalPoint } from "./research-external-analysis.ts";

/**
 * Observational research atlas, pinned to source vintages (October 2026).
 * Income is SILC reference-year, NOT publication/survey year.
 * HICP annual average index is the frozen 2015=100 Eurostat prc_hicp_aind release.
 * Household spending is HBS current-price €/average household/month;
 * equivalised income is SILC €/equivalent person/year: not interchangeable levels.
 */
export const DRIVERS_SOURCES = {
  silc: "https://www.statistics.gr/documents/20181/30dc21b1-d0b6-feb9-beca-62e75e6b0d86",
  prices: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table?lang=en",
  hbs: "https://www.statistics.gr/documents/20181/18958813/DT_eop_2025_en.pdf/5f6cedd1-de1b-f227-f783-508c5976295b",
  cpi: "https://lms.statistics.gr/documents/20181/18744362/DT_deiktis_timon_katanaloti_2025_%CE%95%CE%9D.pdf/fabbec7f-6c21-b455-5f6b-2319cbab2836"
} as const;

export type DriverYear = Readonly<{
  year: number;
  spending: number;
  realSpending: number;
  income: number | null;
  realIncome: number | null;
  priceIndex: number;
  inflation: number | null;
  realSpendingYoY: number | null;
  nominalSpendingYoY: number | null;
}>;

// Survey 2019 -> income year 2018, ... survey 2025 -> income year 2024
export const SILC_EQUIVALISED_INCOME_REFYEAR: Readonly<Record<number, number>> = {
  2018: 9382, 2019: 10041, 2020: 9952, 2021: 10832,
  2022: 11546, 2023: 12391, 2024: 13381
};

// Frozen annual mean prices by calendar year, Eurostat HICP (2015=100, rounded).
// Not end-December annual inflation nor national CPI (which uses a different index).
export const HICP_ANNUAL_2015_BASE: Readonly<Record<number, number>> = {
  2019: 102.5, 2020: 101.2, 2021: 101.8, 2022: 111.2,
  2023: 115.8, 2024: 119.3, 2025: 122.8
};
const spending = externalGroup("household-spending-history")?.series.find(x=>x.id==="hbs-monthly-average")?.points ?? [];
const allYears = spending.map(p=>p.year).filter(year=>year in HICP_ANNUAL_2015_BASE);

export function inflationAdjusted(value: number, year: number, referenceYear=2019): number | null {
  const price = HICP_ANNUAL_2015_BASE[year], base=HICP_ANNUAL_2015_BASE[referenceYear];
  return price && base ? value*base/price : null;
}
function percentGrowth(previous: number | null | undefined, current: number | null | undefined): number | null {
  return previous!=null&&current!=null&&previous!==0?100*(current/previous-1):null;
}
export const DRIVER_ROWS: readonly DriverYear[] = allYears.map(year=>{
  const amount=spending.find(p=>p.year===year)?.value;
  if(amount==null)throw new Error("Household spending observation unavailable for "+year);
  const previous=spending.find(p=>p.year===year-1)?.value;
  const income=SILC_EQUIVALISED_INCOME_REFYEAR[year]??null;
  const realSpending=inflationAdjusted(amount,year)!;
  const realPrevious=previous==null?null:inflationAdjusted(previous,year-1);
  return {
    year, spending:amount, realSpending, income,
    realIncome:income===null?null:inflationAdjusted(income,year),
    priceIndex:HICP_ANNUAL_2015_BASE[year],
    inflation:year-1 in HICP_ANNUAL_2015_BASE?percentGrowth(HICP_ANNUAL_2015_BASE[year-1],HICP_ANNUAL_2015_BASE[year]):null,
    nominalSpendingYoY:percentGrowth(previous,amount),
    realSpendingYoY:percentGrowth(realPrevious,realSpending)
  };
});
export type DriversSeriesId="spending"|"realSpending"|"income"|"realIncome"|"priceIndex";
export const DRIVER_SERIES: Readonly<Record<DriversSeriesId,{label:string;description:string;unit:string}>>={
  spending:{label:"Δαπάνη νοικοκυριού · τρέχουσα",description:"ΕΟΠ · €/μήνα/νοικοκυριό",unit:"€/μήνα"},
  realSpending:{label:"Δαπάνη · τιμές 2019",description:"ΕΟΠ αποπληθωρισμένη με τον ΕνΔΤΚ",unit:"€/μήνα · τιμές 2019"},
  income:{label:"Διαθέσιμο εισόδημα · ονομαστικό",description:"EU-SILC · €/ισοδύναμο άτομο/έτος, εισοδηματικό έτος",unit:"€/έτος"},
  realIncome:{label:"Διαθέσιμο εισόδημα · τιμές 2019",description:"EU-SILC αποπληθωρισμένο με τον ΕνΔΤΚ",unit:"€/έτος · τιμές 2019"},
  priceIndex:{label:"Εναρμονισμένος δείκτης τιμών",description:"Eurostat · ετήσιος μέσος, 2015=100",unit:"2015=100"}
};
export const DRIVER_SERIES_IDS=Object.keys(DRIVER_SERIES) as DriversSeriesId[];

export type PairedObservation={incomeYear:number;spendingYear:number;income:number;spending:number};
export function spendingIncomePairs(opts:{from:number;to:number;lag:0|1;real:boolean}):PairedObservation[] {
  const rowsByYear=new Map(DRIVER_ROWS.map(row=>[row.year,row]));
  return DRIVER_ROWS.filter(row=>row.year>=opts.from&&row.year<=opts.to&&row.income!==null)
    .flatMap(row=>{
      const expenditure=rowsByYear.get(row.year+opts.lag);
      const income=opts.real?row.realIncome:row.income;
      const expense=opts.real?expenditure?.realSpending:expenditure?.spending;
      return income!=null&&expense!=null?[{incomeYear:row.year,spendingYear:row.year+opts.lag,income,spending:expense}]:[];
    });
}
export function pearsonCorrelation(points:readonly PairedObservation[]):number|null {
  if(points.length<5)return null;
  const meanX=points.reduce((sum,p)=>sum+p.income,0)/points.length;
  const meanY=points.reduce((sum,p)=>sum+p.spending,0)/points.length;
  const covariance=points.reduce((sum,p)=>sum+(p.income-meanX)*(p.spending-meanY),0);
  const x2=points.reduce((sum,p)=>sum+(p.income-meanX)**2,0);
  const y2=points.reduce((sum,p)=>sum+(p.spending-meanY)**2,0);
  if(x2<1e-9||y2<1e-9)return null;
  return Math.max(-1,Math.min(1,covariance/Math.sqrt(x2*y2)));
}
export function indexedDrivers(id:DriversSeriesId,from:number,to:number,baseYear=2019):ExternalPoint[]{
  const base=DRIVER_ROWS.find(r=>r.year===baseYear)?.[id];
  if(base==null||base===0)return [];
  return DRIVER_ROWS.filter(r=>r.year>=from&&r.year<=to&&(r[id]!=null))
    .map(r=>({year:r.year,period:String(r.year),value:100*(r[id] as number)/base}));
}
export function spendingDriversCsv(from:number,to:number,lag:0|1,real:boolean):string{
  const head="income_reference_year,spending_year,equivalised_income_eur_annual,household_spending_eur_monthly,inflation_adjusted_2019,source_income,source_spending,source_prices";
  const pairs=spendingIncomePairs({from,to,lag,real});
  const csvCell=(s:string|number)=>'"'+String(s).replace(/"/g,'""')+'"';
  return [head,...pairs.map(p=>[p.incomeYear,p.spendingYear,p.income.toFixed(2),p.spending.toFixed(2),real,DRIVERS_SOURCES.silc,DRIVERS_SOURCES.hbs,DRIVERS_SOURCES.prices].map(csvCell).join(","))].join("\r\n")+"\r\n";
}
