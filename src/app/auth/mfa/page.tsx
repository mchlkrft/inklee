"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/spinner";
import { useRecoveryCode } from "./use-recovery-code";

export default function MfaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  const {
    submitRecovery,
    pending: recoveryPending,
    error: recoveryError,
  } = useRecoveryCode({ onSuccess: () => router.replace("/dashboard") });

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) {
        router.replace("/dashboard");
        return;
      }
      const { data: challenge, error: cErr } =
        await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cErr || !challenge) {
        setError(cErr?.message ?? "Challenge failed");
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code: code.replace(/\s/g, ""),
      });
      if (vErr) {
        setError("Invalid code — try again.");
      } else {
        router.replace("/dashboard");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Two-factor authentication
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter one of your recovery codes."}
          </p>
        </div>

        {mode === "totp" ? (
          <form onSubmit={handleTotp} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-center text-lg tracking-widest text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={pending || code.length < 6}
              className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Verify"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRecovery(code);
            }}
            className="space-y-4"
          >
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              maxLength={8}
              required
              autoFocus
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-center text-lg tracking-widest text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {recoveryError && (
              <p className="text-sm text-destructive">{recoveryError}</p>
            )}
            <button
              type="submit"
              disabled={recoveryPending || code.length < 8}
              className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {recoveryPending ? (
                <Spinner className="w-4 h-4 mx-auto" />
              ) : (
                "Use recovery code"
              )}
            </button>
          </form>
        )}

        <button
          onClick={() => {
            setMode((m) => (m === "totp" ? "recovery" : "totp"));
            setCode("");
            setError(null);
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {mode === "totp"
            ? "Use a recovery code instead"
            : "Use authenticator app instead"}
        </button>
      </div>
    </div>
  );
}
