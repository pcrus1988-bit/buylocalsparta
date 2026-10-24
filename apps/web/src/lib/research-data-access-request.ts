/** Public inquiry validation only. This module never returns respondent data. */
export type ResearchDataAccessInquiry = Readonly<{ email: string; message: string }>;

export class ResearchDataAccessInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export function validateResearchDataAccessInquiry(value: unknown): ResearchDataAccessInquiry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchDataAccessInputError("invalid_request", "Μη έγκυρο αίτημα.");
  }
  const body = value as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (email.length < 6 || email.length > 254 || /[\r\n]/.test(email)
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new ResearchDataAccessInputError("invalid_email", "Παρακαλούμε ελέγξτε τη διεύθυνση email.");
  }
  if (message.length < 20 || message.length > 2500) {
    throw new ResearchDataAccessInputError("invalid_message", "Το μήνυμα πρέπει να περιέχει 20–2.500 χαρακτήρες.");
  }
  if (body.acceptProcessing !== true) {
    throw new ResearchDataAccessInputError("consent_required", "Παρακαλούμε επιβεβαιώστε την ενημέρωση επεξεργασίας των στοιχείων επικοινωνίας.");
  }
  return { email, message };
}
