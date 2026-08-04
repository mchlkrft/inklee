import { serviceClient } from "@/lib/supabase/service";
import { getLegalDoc } from "@/lib/legal/documents";

// Resolves the CURRENT version of each activation-approval key that is bound to a
// versioned artifact (terms, tax policy, legal classification). The pure gate
// re-closes an approval whose recorded bound_artifact no longer matches the
// current version here, so a rolled Terms hash or a superseded tax policy forces
// re-approval before live charging can continue.
//
// FAIL CLOSED: when a current version cannot be read, we return a sentinel that
// no real bound_artifact can match, so the gate blocks rather than trusting a
// stale approval. Keys NOT returned here have no bindable artifact and are simply
// not version-checked (the pure gate only checks keys present in the map).

const UNRESOLVED = "__unresolved__";

async function currentTaxPolicyVersion(): Promise<string> {
  const { data, error } = await serviceClient
    .from("tax_policies")
    .select("version_label")
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data?.version_label) return UNRESOLVED;
  return data.version_label as string;
}

async function currentLegalPolicyVersion(kind: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("billing_legal_policies")
    .select("version_label")
    .eq("policy_kind", kind)
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data?.version_label) return UNRESOLVED;
  return data.version_label as string;
}

function currentTermsHash(): string {
  try {
    return getLegalDoc("terms").versionHash;
  } catch {
    // Runtime read failure (e.g. content not bundled) fails closed.
    return UNRESOLVED;
  }
}

// C1.9 / R5 Q5 (counsel master package §6.1): the guest-buyer privacy text
// lives in privacy.md, not terms.md, and counsel directed hash-binding it in
// this SAME mechanism while the edit was already in flight ("this pass is the
// cheapest moment"). Binding is not gating: `privacy_notice_approved` is
// returned here so a stale-artifact re-close is POSSIBLE, but it is
// deliberately NOT added to REQUIRED_APPROVAL_KEYS (config.ts) — that is a
// separate founder/counsel call on gating semantics, not made by this change.
function currentPrivacyHash(): string {
  try {
    return getLegalDoc("privacy").versionHash;
  } catch {
    // Runtime read failure (e.g. content not bundled) fails closed.
    return UNRESOLVED;
  }
}

export async function getCurrentBillingArtifacts(): Promise<
  Record<string, string>
> {
  const [tax, classification, withdrawal] = await Promise.all([
    currentTaxPolicyVersion(),
    currentLegalPolicyVersion("service_classification"),
    currentLegalPolicyVersion("withdrawal_policy"),
  ]);
  return {
    terms_approved: currentTermsHash(),
    privacy_notice_approved: currentPrivacyHash(),
    tax_policy_approved: tax,
    consumer_classification_approved: classification,
    consumer_withdrawal_copy_approved: withdrawal,
  };
}
