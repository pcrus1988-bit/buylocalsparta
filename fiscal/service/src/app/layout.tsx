import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={
  title:"KONTA MOY FISCAL",
  description:"Independent Greek business invoicing technology platform",
  robots:{index:false,follow:false,noarchive:true,nosnippet:true}
};
export default function StandaloneFiscalRoot({children}:{children:React.ReactNode}){
  return <html lang="el"><body>{children}</body></html>;
}
