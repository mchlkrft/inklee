"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SelectInput from "@/components/select-input";
import {
  CLAIMANT_ROLE_LABELS,
  CLAIM_ADDRESS_MAX,
  CLAIM_EVIDENCE_MAX,
  type ClaimantRole,
} from "@inklee/shared/studio-profile";
import { submitClaimAction } from "../../actions";

const ROLE_OPTIONS = (
  Object.entries(CLAIMANT_ROLE_LABELS) as Array<[ClaimantRole, string]>
).map(([value, label]) => ({ value, label }));

export default function ClaimForm({
  mapLocationId,
}: {
  mapLocationId: string;
}) {
  const router = useRouter();
  const [claimantRole, setClaimantRole] = useState<string>("artist");
  const [socialLink, setSocialLink] = useState("");
  const [addressConfirmation, setAddressConfirmation] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitClaimAction(mapLocationId, {
        claimantRole,
        socialLink: socialLink.trim(),
        addressConfirmation: addressConfirmation.trim(),
        evidenceNote: evidenceNote.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/studio");
      router.refresh();
    });
  };

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const label = "text-xs text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <span className={label}>Your role at the studio</span>
        <SelectInput
          options={ROLE_OPTIONS}
          value={claimantRole}
          onChange={(e) => setClaimantRole(e.target.value)}
          ariaLabel="Your role at the studio"
        />
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="claim-social">
          Social link
        </label>
        <input
          id="claim-social"
          className={field}
          value={socialLink}
          onChange={(e) => setSocialLink(e.target.value)}
          placeholder="https://instagram.com/yourstudio"
        />
        <p className={label}>
          The studio account, or a profile that clearly connects you to it.
        </p>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="claim-address">
          Confirm the street address
        </label>
        <input
          id="claim-address"
          className={field}
          value={addressConfirmation}
          maxLength={CLAIM_ADDRESS_MAX}
          onChange={(e) => setAddressConfirmation(e.target.value)}
          placeholder="Street and number"
        />
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="claim-note">
          Anything else (optional)
        </label>
        <textarea
          id="claim-note"
          className={`${field} min-h-16`}
          value={evidenceNote}
          maxLength={CLAIM_EVIDENCE_MAX}
          onChange={(e) => setEvidenceNote(e.target.value)}
          placeholder="Resident artists, website, whatever helps us check faster."
        />
      </div>

      {error ? <p className="text-sm text-brand-red">{error}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send claim"}
      </button>
    </div>
  );
}
