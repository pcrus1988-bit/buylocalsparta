import {notFound} from "next/navigation";
import {FiscalSsoBridgeClient} from "../../../../components/FiscalSsoBridgeClient";
export const dynamic="force-dynamic";
export const metadata={title:"KONTA MOY FISCAL · Secure SSO",robots:{index:false,follow:false}};
export default function FiscalSsoBridge(){
 if(process.env.FISCAL_STANDALONE_MODE!=="true")notFound();
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><div className="fiscal-brand">KONTA MOY <span>FISCAL</span></div></header>
  <FiscalSsoBridgeClient/>
 </div></main>;
}
