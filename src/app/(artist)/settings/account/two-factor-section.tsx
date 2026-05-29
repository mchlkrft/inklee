"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/spinner";
import CopyButton from "@/components/copy-button";
import {
  saveMfaRecoveryCodesAction,
  clearMfaRecoveryCodesAction,
  logAuthEventAction,
} from "./actions";

type Step = "idle" | "enrolling" | "verifying" | "codes" | "disabling" | "done";

function generateCodes(): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () =>
    Array.from(
      { length: 8 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join(""),
  );
}

export default function TwoFactorSection({
  isEnabled,
  factorId: initialFactorId,
}: {
  isEnabled: boolean;
  factorId: string | null;
}) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enroll state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(initialFactorId);
  const [totpCode, setTotpCode] = useState("");

  // Recovery codes
  const [codes, setCodes] = useState<string[]>([]);
  const [codesConfirmed, setCodesConfirmed] = useState(false);

  const enabled = isEnabled && step === "idle";

  async function startEnroll() {
    setPending(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Inklee authenticator",
      });
      if (err || !data) {
        setError(
          err?.message ?? "We couldn’t start two-factor enrolment. Try again.",
        );
        return;
      }
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("enrolling");
    } finally {
      setPending(false);
    }
  }

  async function verifyEnroll() {
    if (!factorId) return;
    setPending(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode.replace(/\s/g, ""),
      });
      if (err) {
        setError("Invalid code. Try again.");
        return;
      }
      const newCodes = generateCodes();
      setCodes(newCodes);
      await saveMfaRecoveryCodesAction(newCodes);
      void logAuthEventAction("2fa_enabled", { method: "totp" });
      setStep("codes");
    } finally {
      setPending(false);
    }
  }

  async function startDisable() {
    setStep("disabling");
    setTotpCode("");
    setError(null);
  }

  async function confirmDisable() {
    if (!factorId) return;
    setPending(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode.replace(/\s/g, ""),
      });
      if (err) {
        setError("Invalid code. Try again.");
        return;
      }
      await supabase.auth.mfa.unenroll({ factorId });
      await clearMfaRecoveryCodesAction();
      void logAuthEventAction("2fa_disabled", { method: "totp" });
      setFactorId(null);
      setStep("done");
    } finally {
      setPending(false);
    }
  }

  if (step === "done") {
    return (
      <div className="rounded-md border border-border px-4 py-4 space-y-1">
        <p className="text-sm text-foreground">
          Two-factor authentication disabled
        </p>
        <p className="text-xs text-muted-foreground">
          Your account is secured by password only.{" "}
          <button
            onClick={() => setStep("idle")}
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Re-enable
          </button>
        </p>
      </div>
    );
  }

  if (step === "codes") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Save your recovery codes
          </p>
          <p className="text-xs text-muted-foreground">
            Each code can be used once to access your account if you lose your
            authenticator. Store them somewhere safe.
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
            {codes.map((c) => (
              <span key={c} className="text-foreground">
                {c}
              </span>
            ))}
          </div>
          <CopyButton text={codes.join("\n")} label="Copy all" />
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={codesConfirmed}
            onChange={(e) => setCodesConfirmed(e.target.checked)}
            className="mt-0.5 accent-foreground"
          />
          <span className="text-sm text-muted-foreground">
            I have saved my recovery codes
          </span>
        </label>
        <button
          disabled={!codesConfirmed}
          onClick={() => setStep("idle")}
          className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          Done. 2FA is active
        </button>
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Scan this QR code with your authenticator app (Google Authenticator,
          Authy, 1Password, etc.).
        </p>
        {qrCode && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrCode}
            alt="2FA QR code"
            className="w-40 h-40 rounded-md border border-border"
          />
        )}
        {secret && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            Manual key: {secret}
          </p>
        )}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Enter the 6-digit code to confirm
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="000000"
            maxLength={6}
            className="w-40 rounded-md border border-border bg-transparent px-3 py-2 text-center text-lg tracking-widest text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={pending || totpCode.length < 6}
            onClick={verifyEnroll}
            className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? (
              <Spinner className="w-4 h-4 mx-auto" />
            ) : (
              "Verify & activate"
            )}
          </button>
          <button
            onClick={() => setStep("idle")}
            className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "disabling") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter your current authenticator code to disable 2FA.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          placeholder="000000"
          maxLength={6}
          autoFocus
          className="w-40 rounded-md border border-border bg-transparent px-3 py-2 text-center text-lg tracking-widest text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={pending || totpCode.length < 6}
            onClick={confirmDisable}
            className="rounded-full bg-destructive px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Disable 2FA"}
          </button>
          <button
            onClick={() => setStep("idle")}
            className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Two-factor authentication</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? "Active. Your account requires a code at each login."
              : "Protect your account with an authenticator app."}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            enabled
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? "On" : "Off"}
        </span>
      </div>

      {enabled ? (
        <button
          onClick={startDisable}
          className="text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          Disable two-factor authentication
        </button>
      ) : (
        <button
          disabled={pending}
          onClick={startEnroll}
          className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Enable 2FA"}
        </button>
      )}
    </div>
  );
}
