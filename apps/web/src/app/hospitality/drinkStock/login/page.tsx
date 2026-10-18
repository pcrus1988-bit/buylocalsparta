import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hospitalityIdentity } from "../../../../lib/hospitality-partner-access";
import { HospitalityLoginForm } from "../../../../components/HospitalityLoginForm";
import styles from "../../hospitality.module.css";

export const metadata: Metadata = { title: "DrinkStock Partner Login", robots: { index: false, follow: false } };

export default async function HospitalityLogin() {
  const principal = await hospitalityIdentity();
  if (principal) redirect("/drinkStock/dashboard");
  return <main className={styles.main}>
    <section className={styles.authPane}>
      <div className={styles.eyebrow}>DRINKSTOCK / RESTRICTED ACCESS</div>
      <h1>Partner <em>login.</em></h1>
      <p>Συνδέσου με τον εγγεγραμμένο λογαριασμό KONTA MOY που έχει εξουσιοδοτηθεί για συγκεκριμένη επιχείρηση hospitality.</p>
      <HospitalityLoginForm />
      <p className={styles.helpCopy}>Η εγγραφή στο KONTA MOY από μόνη της δεν επιτρέπει πρόσβαση στο DrinkStock. Απαιτείται ενεργή ανάθεση συνεργάτη και ενεργοποίηση εφαρμογής.</p>
      <Link href="https://hospitality.kontamou.site/drinkStock">← Επιστροφή στο DrinkStock</Link>
    </section>
  </main>;
}