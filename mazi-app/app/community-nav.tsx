import Link from "next/link";
import s from "./community.module.css";
export function MaziCommunityNav(){
 return <nav aria-label="Πλοήγηση κοινότητας ΜΑΖΙ" className={s.nav}>
  <Link href="/members">Ο χώρος μου</Link>
  <Link href="/marketplace">Marketplace</Link>
  <Link href="/forum">Forum</Link>
  <Link href="/livechat">Livechat</Link>
 </nav>;
}
