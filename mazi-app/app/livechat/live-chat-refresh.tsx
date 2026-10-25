"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
/** Server stays authoritative; no in-memory messages or simulated participants.
 * Refresh when visible; stop polling once the component unmounts.
 */
export default function LiveChatRefresh(){
 const router=useRouter();
 useEffect(()=>{
  const poll=()=>{if(document.visibilityState==="visible")router.refresh();};
  const id=window.setInterval(poll,8000);
  return ()=>window.clearInterval(id);
 },[router]);
 return <small aria-live="off">Νέα μηνύματα ελέγχονται αυτόματα περίπου κάθε 8 δευτερόλεπτα.</small>;
}
