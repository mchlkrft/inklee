/**
 * Maps Stripe Connect `requirements.currently_due` codes to artist-facing
 * labels (Slice 79 / Slice 80 P0-3). Pure + client-safe — no Stripe import — so
 * both the server page and the client KYC form can describe exactly what Stripe
 * still needs, which is the whole point of in-app Custom onboarding (the artist
 * never visits Stripe, so they can only self-resolve if we tell them what's
 * missing). These codes are field names, not PII, so they're safe to surface.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.first_name": "First name",
  "individual.last_name": "Last name",
  "individual.dob.day": "Date of birth",
  "individual.dob.month": "Date of birth",
  "individual.dob.year": "Date of birth",
  "individual.email": "Email address",
  "individual.phone": "Phone number",
  "individual.address.line1": "Address",
  "individual.address.city": "City",
  "individual.address.postal_code": "Postal code",
  "individual.address.state": "State / region",
  "individual.id_number": "National ID number",
  "individual.verification.document": "A photo of your ID document",
  "individual.verification.additional_document":
    "An additional ID or proof-of-address document",
  external_account: "Bank account (IBAN) for payouts",
  "tos_acceptance.date": "Acceptance of the Stripe agreement",
  "tos_acceptance.ip": "Acceptance of the Stripe agreement",
  "business_profile.url":
    "A link to your work (we set this to your inkl.ee page)",
  "business_profile.mcc": "Your business category",
  "business_profile.product_description": "A short description of your work",
};

function humaniseRequirementCode(code: string): string {
  // Unknown code → strip the namespace and humanise, so we never show a raw
  // dotted Stripe key to the artist.
  const tail = code.split(".").pop() ?? code;
  const spaced = tail.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Turns a raw `currently_due` array into a de-duplicated, human-readable list of
 * what the artist still needs to provide. Several DOB / ToS codes collapse to a
 * single label.
 */
export function describeRequirements(currentlyDue: string[]): string[] {
  const labels = currentlyDue.map(
    (code) => REQUIREMENT_LABELS[code] ?? humaniseRequirementCode(code),
  );
  return Array.from(new Set(labels));
}
