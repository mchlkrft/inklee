"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CLAIMANT_ROLE_LABELS } from "@inklee/shared/studio-profile";
import { decideClaimAction } from "../actions";

export type ClaimRow = {
  id: string;
  locationId: string;
  locationName: string;
  locationPlace: string;
  contested: boolean;
  locationClaimed: boolean;
  claimantName: string;
  claimantSlug: string | null;
  claimantRole: string;
  socialLink: string;
  addressConfirmation: string | null;
  evidenceNote: string | null;
  createdAt: string;
};

export default function ClaimsQueue({ rows }: { rows: ClaimRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (id: string, decision: "approve" | "reject") => {
    setError(null);
    setConfirmApprove(null);
    startTransition(async () => {
      const result = await decideClaimAction(id, decision);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No claims waiting. Artists claim studios from their map pages.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-brand-red">{error}</p> : null}
      {rows.map((r) => (
        <div
          key={r.id}
          className="space-y-2 rounded-md border border-border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link
                href={`/admin/map/${r.locationId}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {r.locationName}
              </Link>
              <p className="text-xs text-muted-foreground">{r.locationPlace}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {r.contested ? (
                <span className="rounded-full bg-brand-red/15 px-2 py-0.5 text-xs text-brand-red">
                  Contested
                </span>
              ) : null}
              {r.locationClaimed ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Location already claimed
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <p className="text-sm text-foreground">
            {r.claimantSlug ? (
              <Link
                href={`/${r.claimantSlug}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {r.claimantName}
              </Link>
            ) : (
              r.claimantName
            )}{" "}
            <span className="text-xs text-muted-foreground">
              ·{" "}
              {CLAIMANT_ROLE_LABELS[
                r.claimantRole as keyof typeof CLAIMANT_ROLE_LABELS
              ] ?? r.claimantRole}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            <a
              href={r.socialLink}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline"
            >
              {r.socialLink.length > 80
                ? `${r.socialLink.slice(0, 80)}...`
                : r.socialLink}
            </a>
            {r.addressConfirmation
              ? ` · confirms: ${r.addressConfirmation}`
              : ""}
          </p>
          {r.evidenceNote ? (
            <p className="text-sm text-muted-foreground">{r.evidenceNote}</p>
          ) : null}
          <div className="flex gap-2">
            {confirmApprove === r.id ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide(r.id, "approve")}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Yes, make them the owner
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmApprove(null)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmApprove(r.id)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide(r.id, "reject")}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
