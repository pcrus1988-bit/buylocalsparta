export function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
export function validEmail(value: string): boolean {
  return value.length >= 5 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export type ApplicationInput = {
  business_name: string; representative_name: string; location: string; sector: string;
  registry_number: string | null; description: string;
};
export function validateApplication(input: ApplicationInput): string | null {
  if (input.business_name.length < 3 || input.business_name.length > 160) return "Ελέγξτε την επωνυμία.";
  if (input.representative_name.length < 3 || input.representative_name.length > 120) return "Ελέγξτε το ονοματεπώνυμο.";
  if (input.location.length < 2 || input.location.length > 120) return "Ελέγξτε την περιοχή.";
  if (input.sector.length < 2 || input.sector.length > 100) return "Ελέγξτε τον κλάδο.";
  if (input.registry_number !== null && !/^[0-9]{12}$/.test(input.registry_number)) return "Αν συμπληρώσεις αριθμό ΓΕΜΗ, πρέπει να είναι 12 ψηφία.";
  if (input.description.length < 20 || input.description.length > 1800) return "Περιγράψτε την επιχείρησή σας με 20–1.800 χαρακτήρες.";
  return null;
}
export type ProposalInput = {title:string;category:string;amount_cents:number;details:string};
export function validateProposal(p:ProposalInput):string|null{
  if(p.title.length<8||p.title.length>140) return "Ο τίτλος πρέπει να έχει 8–140 χαρακτήρες.";
  if(!["resilience","growth","joint"].includes(p.category)) return "Επιλέξτε έγκυρη κατηγορία.";
  if(!Number.isSafeInteger(p.amount_cents)||p.amount_cents<50000||p.amount_cents>20000000) return "Το αιτούμενο ποσό πρέπει να είναι €500–€200.000.";
  if(p.details.length<80||p.details.length>4000) return "Η περιγραφή πρέπει να έχει 80–4.000 χαρακτήρες.";
  return null;
}
