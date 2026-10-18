import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { accessibleDrinkStockPartners, hospitalityIdentity } from "../../../../../lib/hospitality-partner-access";
import styles from "../../../hospitality.module.css";

const sections=[
  {href:"",label:"Επισκόπηση"},
  {href:"/live",label:"Ζωντανές τιμές"},
  {href:"/screen",label:"Οθόνες"},
  {href:"/guest",label:"Επισκέπτες"},
  {href:"/settings",label:"Ρυθμίσεις"},
  {href:"/reports",label:"Αναφορές"}
] as const;

export default async function PartnerWorkspaceLayout({children,params}:{children:React.ReactNode;params:Promise<{partnerId:string}>}) {
  const principal=await hospitalityIdentity();
  if(!principal)redirect("/drinkStock/login");
  const {partnerId}=await params;
  // A checked UUID in the path is NOT authorization: verify membership on the server.
  if(!(await accessibleDrinkStockPartners(principal.userId)).some(p=>p.partnerId===partnerId))notFound();
  const root="/drinkStock/dashboard/"+partnerId;
  return <>
    <nav className={styles.partnerNav} aria-label="DrinkStock partner sections">
      {sections.map(section=><Link key={section.href} href={root+section.href}>{section.label}</Link>)}
    </nav>
    {children}
  </>;
}