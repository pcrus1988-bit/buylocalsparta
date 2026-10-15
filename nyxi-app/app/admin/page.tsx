import ReviewerWorkspace from "./reviewer-workspace";

export const metadata = { title: "NYXI Private Reviewer", robots: { index: false, follow: false } };
// Public route contains only an authentication form. Every private API request
// independently checks a Supabase Auth JWT and nyxi_reviewers role membership.
export default function ReviewerPage() { return <ReviewerWorkspace />; }
