import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  controlResearchCohort, researchCohortOverview, researchCohortEvaluation,
  type CohortCommand
} from "../../../../../../../lib/research-cohort-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{slug:string}> }) {
  try {
    const principal=await requireAdminSession(request,{permission:"research.read"});
    const {slug}=await context.params;
    if (slug!=="greek-retail-2026") return Response.json({error:"RESEARCH_STUDY_UNSUPPORTED"},{status:404});
    const mode=new URL(request.url).searchParams.get("view");
    const data=mode==="evaluation"
      ? await researchCohortEvaluation(principal,
          (new URL(request.url).searchParams.get("cohort")||"all") as "all"|"A"|"B")
      : await researchCohortOverview(principal);
    return Response.json(data,{headers:{"Cache-Control":"private,no-store"}});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"RESEARCH_COHORT_READ_FAILED"},
      {status:500,headers:{"Cache-Control":"no-store"}});
  }
}

export async function POST(request: Request, context: {params:Promise<{slug:string}>}) {
  try {
    const principal=await requireAdminSession(request,{csrf:true,permission:"research.fieldwork.manage"});
    const {slug}=await context.params;
    if (slug!=="greek-retail-2026") return Response.json({error:"RESEARCH_STUDY_UNSUPPORTED"},{status:404});
    const body=await request.json() as {
      cohort?:string;command?:CohortCommand;approvedCount?:number;
      reviewConfirmed?:boolean;finalConfirmed?:boolean;legalReviewConfirmed?:boolean;
    };
    if (!body.cohort || !["prepare","approve","pause","resume","cancel"].includes(String(body.command))) {
      return Response.json({error:"RESEARCH_COHORT_ACTION_INVALID"},{status:400});
    }
    const result=await controlResearchCohort(principal,{
      cohort:body.cohort,command:body.command as CohortCommand,
      approvedCount:body.approvedCount,reviewConfirmed:body.reviewConfirmed,
      finalConfirmed:body.finalConfirmed,legalReviewConfirmed:body.legalReviewConfirmed
    });
    await recordAdminAudit(principal,"research.cohort."+body.command,"research_study",slug,
      "Governed full-frame cohort transition",{cohort:result.cohort,state:result.state,count:result.count??0});
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"RESEARCH_COHORT_ACTION_FAILED"},
      {status:400,headers:{"Cache-Control":"no-store"}});
  }
}
