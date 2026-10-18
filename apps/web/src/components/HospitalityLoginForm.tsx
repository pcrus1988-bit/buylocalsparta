"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../app/hospitality/hospitality.module.css";

export function HospitalityLoginForm() {
  const router = useRouter();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy)return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/hospitality/login", {
        method:"POST",
        headers:{"content-type":"application/json"},
        credentials:"same-origin",
        body:JSON.stringify({email,password})
      });
      if(!response.ok)throw new Error(response.status===503
        ?"Η επαλήθευση δεν είναι προσωρινά διαθέσιμη."
        :"Δεν είναι δυνατή η σύνδεση ή δεν υπάρχει ενεργή εξουσιοδότηση DrinkStock.");
      router.replace("/drinkstock/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"Αποτυχία σύνδεσης.");
    } finally {setBusy(false);}
  }
  return <form className={styles.loginForm} onSubmit={submit}>
    <label htmlFor="hospitality-email">Email λογαριασμού KONTA MOY</label>
    <input id="hospitality-email" type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)} />
    <label htmlFor="hospitality-password">Κωδικός πρόσβασης</label>
    <input id="hospitality-password" type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} />
    {error?<p className={styles.error} role="alert">{error}</p>:null}
    <button type="submit" disabled={busy}>{busy?"Έλεγχος…":"Σύνδεση στον χώρο συνεργάτη ↗"}</button>
  </form>;
}