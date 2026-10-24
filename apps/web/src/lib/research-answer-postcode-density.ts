
/** The exact same Greece projection, Gaussian blending and four-stop palette
 * used for the public study's fluid postcode-participation heatmap.
 * For answer-specific views we FIRST aggregate into large, protected
 * geographic cohorts: no postcode marker or business-level pixel is drawn.
 */
export type AnswerPostcodeLocation = Readonly<{
  postcode: string; prefecture: string; answered: number; matched: number;
}>;
export type PostcodeReference = Readonly<{
  postcode: string; region?: string; latitude: number; longitude: number;
}>;
type Bucket = {
  key: string; latitude: number; longitude: number; region: string;
  answered: number; matched: number;
};
type Anchor = Bucket & { sigma: number };

const WIDTH = 324, HEIGHT = 260, PIXEL_SIZE = 2.5;
const PALETTE = [[105,167,114],[223,194,77],[226,131,43],[180,50,30]] as const;
/** Smaller than a Greek Region but not an address, street or exact postcode. */
const FINE_LON = 0.48, FINE_LAT = 0.39;
const COARSE_LON = 0.96, COARSE_LAT = 0.78;
const MIN_OUTCOME = 5;
const MIN_BASE = 15;

function bucketKey(region:string, latitude:number, longitude:number,
  latStep:number, lonStep:number) {
  const col = Math.floor((longitude-19)/lonStep);
  const row = Math.floor((latitude-34)/latStep);
  return {
    key: region + ":" + col + ":" + row,
    longitude: 19 + (col + 0.5)*lonStep,
    latitude: 34 + (row + 0.5)*latStep
  };
}
function aggregateBuckets(buckets:readonly Bucket[], latStep:number,lonStep:number) {
  const result = new Map<string,Bucket>();
  for(const b of buckets) {
    const location=bucketKey(b.region,b.latitude,b.longitude,latStep,lonStep);
    const prior=result.get(location.key);
    if(prior){prior.answered+=b.answered;prior.matched+=b.matched;}
    else result.set(location.key,{...location,region:b.region,answered:b.answered,matched:b.matched});
  }
  return [...result.values()];
}
function safeCohort(bucket: Bucket) {
  // Prevent a colour hotspot from encoding one respondent's choice, even for
  // a privileged analyst. Counts outside the detail image remain in all stats.
  return bucket.answered >= MIN_BASE
    && bucket.matched >= MIN_OUTCOME
    && bucket.answered - bucket.matched >= MIN_OUTCOME;
}
function pixelColors(intensity: number, alpha: number, data:Uint8Array, index:number) {
  const normalized = Math.max(0, Math.min(1, intensity));
  const position=normalized*(PALETTE.length-1);
  const stop=Math.min(PALETTE.length-2,Math.floor(position));
  const part=position-stop;
  for(let c=0;c<3;c++) data[index*4+c]=Math.round(
    PALETTE[stop][c]*(1-part)+PALETTE[stop+1][c]*part
  );
  data[index*4+3]=Math.round(230*Math.max(0,Math.min(1,alpha)));
}
function rasterize(anchors:readonly Anchor[]) {
  const numerator=new Float64Array(WIDTH*HEIGHT);
  const denominator=new Float64Array(WIDTH*HEIGHT);
  for(const a of anchors) {
    const x=(55+(a.longitude-19)*65)/PIXEL_SIZE;
    const y=(18+(42-a.latitude)*78)/PIXEL_SIZE;
    const sigma=a.sigma,rad=sigma*3;
    for(let py=Math.max(0,Math.floor(y-rad));py<Math.min(HEIGHT,Math.ceil(y+rad));py++){
      for(let px=Math.max(0,Math.floor(x-rad));px<Math.min(WIDTH,Math.ceil(x+rad));px++){
        const r2=(px+0.5-x)**2+(py+0.5-y)**2;
        const weight=Math.exp(-r2/(2*sigma*sigma));
        const i=py*WIDTH+px;
        numerator[i]+=a.matched*weight;
        denominator[i]+=a.answered*weight;
      }
    }
  }
  let maxMatched=0,maxAnswered=0;
  for(let i=0;i<numerator.length;i++){
    if(numerator[i]>maxMatched)maxMatched=numerator[i];
    if(denominator[i]>maxAnswered)maxAnswered=denominator[i];
  }
  const counts=new Uint8Array(WIDTH*HEIGHT*4);
  const rates=new Uint8Array(WIDTH*HEIGHT*4);
  for(let i=0;i<numerator.length;i++) {
    const density=maxMatched>0
      ? Math.log1p(numerator[i])/Math.log1p(maxMatched) : 0;
    pixelColors(density,Math.min(1,density*3),counts,i);
    const support=maxAnswered>0?denominator[i]/maxAnswered:0;
    const localRate=denominator[i]>1e-9?numerator[i]/denominator[i]:0;
    // Avoid interpreting the barely coloured edges as precise local rates.
    pixelColors(localRate,Math.min(1,support*5)*(support>0.035?1:0),rates,i);
  }
  return {countPixels:counts,ratePixels:rates,width:WIDTH,height:HEIGHT};
}
export function answerPostcodeHeatField(
  rows:readonly AnswerPostcodeLocation[], reference:readonly PostcodeReference[]
) {
  const lookup=new Map(reference.map(p=>[p.postcode,p]));
  const valid:Bucket[]=[];
  let mappedAnswers=0,unmatchedAnswers=0;
  for(const row of rows) {
    const code=row.postcode.replace(/\s/g,"");
    const p=/^\d{5}$/.test(code)?lookup.get(code):undefined;
    const region=p?.region;
    if(!p||!region
      ||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)
      ||p.latitude<34||p.latitude>43||p.longitude<19||p.longitude>30){
      unmatchedAnswers+=row.matched;continue;
    }
    mappedAnswers+=row.matched;
    valid.push({
      key:code,region,latitude:p.latitude,longitude:p.longitude,
      answered:row.answered,matched:row.matched
    });
  }
  const fine=aggregateBuckets(valid,FINE_LAT,FINE_LON);
  const anchors:Anchor[]=[];
  const remaining:Bucket[]=[];
  for(const bucket of fine) {
    if(safeCohort(bucket)) anchors.push({...bucket,sigma:9});
    else remaining.push(bucket);
  }
  for(const bucket of aggregateBuckets(remaining,COARSE_LAT,COARSE_LON)) {
    if(safeCohort(bucket)) anchors.push({...bucket,sigma:16});
  }
  // No center coordinates or individual/postcode rows are emitted.
  const detailMatched=anchors.reduce((n,a)=>n+a.matched,0);
  const drawn=detailMatched>0?rasterize(anchors):null;
  return {
    ...(drawn??{
      countPixels:new Uint8Array(WIDTH*HEIGHT*4),
      ratePixels:new Uint8Array(WIDTH*HEIGHT*4),
      width:WIDTH,height:HEIGHT
    }),
    detailMatched,mappedAnswers,unmatchedAnswers,
    // The remainder is counted in n even when too sparse for an identifiable
    // local density image; it is never treated as zero or discarded from stats.
    privacyCoarsenedOrNotRendered:mappedAnswers-detailMatched,
    spatialCohorts:anchors.length
  };
}
