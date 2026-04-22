"use client";

import { useState } from "react";

export function useRecoveryCode({ onSuccess }: { onSuccess: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitRecovery(code: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "Invalid recovery code");
      } else {
        onSuccess();
      }
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setPending(false);
    }
  }

  return { submitRecovery, pending, error };
}
