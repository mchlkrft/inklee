"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  suspendAccountAction,
  reactivateAccountAction,
  archiveAccountAction,
  resetOnboardingAction,
  triggerPasswordResetAction,
  setTesterFlagAction,
  deleteAccountPermanentlyAction,
} from "./actions";

type AccountStatus = "active" | "suspended" | "archived";

type ActionId =
  | "suspend"
  | "reactivate"
  | "reset_onboarding"
  | "password_reset"
  | "archive"
  | "delete";

type State =
  | { phase: "idle" }
  | { phase: "confirm"; action: ActionId }
  | {
      phase: "done";
      action: ActionId;
      error?: string;
      data?: Record<string, unknown>;
    };

export default function AccountActions({
  accountId,
  accountStatus,
  isSelf,
  isTester,
}: {
  accountId: string;
  accountStatus: AccountStatus;
  isSelf: boolean;
  isTester: boolean;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [reason, setReason] = useState("");
  const [deleteWord, setDeleteWord] = useState("");
  const [pending, startTransition] = useTransition();
  const [tester, setTester] = useState(isTester);
  const [testerPending, startTesterTransition] = useTransition();
  const router = useRouter();

  function startConfirm(action: ActionId) {
    setReason("");
    setDeleteWord("");
    setState({ phase: "confirm", action });
  }

  function cancel() {
    setState({ phase: "idle" });
    setReason("");
  }

  function execute(action: ActionId) {
    startTransition(async () => {
      let result: { error?: string; data?: Record<string, unknown> } = {};

      switch (action) {
        case "suspend":
          result = await suspendAccountAction(accountId, reason);
          break;
        case "reactivate":
          result = await reactivateAccountAction(accountId);
          break;
        case "archive":
          result = await archiveAccountAction(accountId, reason);
          break;
        case "reset_onboarding":
          result = await resetOnboardingAction(accountId);
          break;
        case "password_reset":
          result = await triggerPasswordResetAction(accountId);
          break;
        case "delete":
          result = await deleteAccountPermanentlyAction(accountId);
          if (!result.error) {
            router.push("/admin");
            return;
          }
          break;
      }

      setState({
        phase: "done",
        action,
        error: result.error,
        data: result.data,
      });
    });
  }

  const isConfirming =
    state.phase === "confirm" || (state.phase === "done" && !state.error);

  return (
    <div className="space-y-6">
      {/* Standard controls */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account controls
        </p>

        {accountStatus === "active" && !isSelf && (
          <ActionRow
            label="Suspend account"
            description="Blocks the artist from signing in. Reversible."
            buttonLabel="Suspend"
            variant="warning"
            onTrigger={() => startConfirm("suspend")}
            disabled={pending}
          />
        )}

        {(accountStatus === "suspended" || accountStatus === "archived") && (
          <ActionRow
            label="Reactivate account"
            description="Restores access and lifts the auth ban."
            buttonLabel="Reactivate"
            variant="default"
            onTrigger={() => startConfirm("reactivate")}
            disabled={pending}
          />
        )}

        <ActionRow
          label="Reset onboarding"
          description="Sets onboarding_completed to false. Artist will see onboarding banner again."
          buttonLabel="Reset"
          variant="default"
          onTrigger={() => startConfirm("reset_onboarding")}
          disabled={pending}
        />

        <ActionRow
          label="Trigger password reset"
          description="Sends a password reset email to this account."
          buttonLabel="Send email"
          variant="default"
          onTrigger={() => startConfirm("password_reset")}
          disabled={pending}
        />
      </div>

      {/* Tester flag */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Analytics
        </p>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Tester account
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Excluded from KPIs, funnels, and feature adoption metrics.
            </p>
          </div>
          <button
            type="button"
            disabled={testerPending}
            onClick={() => {
              const newValue = !tester;
              setTester(newValue);
              startTesterTransition(async () => {
                const result = await setTesterFlagAction(accountId, newValue);
                if (result.error) setTester(!newValue);
              });
            }}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              tester
                ? "bg-brand-mustard text-brand-charcoal"
                : "border border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            }`}
          >
            {tester ? "Tester" : "Mark as tester"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      {!isSelf && accountStatus !== "archived" && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive/70">
            Danger zone
          </p>
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Archive account
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Soft-deletes the account. Blocks login permanently. Data is
                retained. Reversible via Reactivate.
              </p>
            </div>
            <button
              onClick={() => startConfirm("archive")}
              disabled={pending}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              Archive account
            </button>
          </div>
        </div>
      )}

      {/* Hard delete — separate danger zone */}
      {!isSelf && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive/70">
            Permanent deletion
          </p>
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Delete account permanently
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Removes the account and all associated data from Supabase.
                Irreversible — cannot be undone.
              </p>
            </div>
            <button
              onClick={() => startConfirm("delete")}
              disabled={pending}
              className="rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
            >
              Delete permanently
            </button>
          </div>
        </div>
      )}

      {/* Confirmation panel */}
      {state.phase === "confirm" && (
        <ConfirmPanel
          action={state.action}
          reason={reason}
          deleteWord={deleteWord}
          onReasonChange={setReason}
          onDeleteWordChange={setDeleteWord}
          onConfirm={() => execute(state.action)}
          onCancel={cancel}
          pending={pending}
        />
      )}

      {/* Result */}
      {state.phase === "done" && (
        <div
          className={`rounded-md px-4 py-3 text-sm space-y-2 ${
            state.error
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-500"
          }`}
        >
          {state.error ? (
            <p>{state.error}</p>
          ) : (
            <>
              <p>{actionDoneLabel(state.action)}</p>
              {state.action === "password_reset" && state.data?.email && (
                <p className="text-xs text-green-500/80">
                  Sent to {String(state.data.email)}.
                </p>
              )}
            </>
          )}
          <button
            onClick={() => setState({ phase: "idle" })}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {isSelf && (
        <p className="text-xs text-muted-foreground">
          You cannot perform destructive actions on your own account.
        </p>
      )}
    </div>
  );
}

function ActionRow({
  label,
  description,
  buttonLabel,
  variant,
  onTrigger,
  disabled,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  variant: "default" | "warning";
  onTrigger: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onTrigger}
        disabled={disabled}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          variant === "warning"
            ? "border border-orange-400/40 text-orange-500 hover:bg-orange-400/10"
            : "border border-border text-muted-foreground hover:text-foreground hover:border-foreground"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function ConfirmPanel({
  action,
  reason,
  deleteWord,
  onReasonChange,
  onDeleteWordChange,
  onConfirm,
  onCancel,
  pending,
}: {
  action: ActionId;
  reason: string;
  deleteWord: string;
  onReasonChange: (v: string) => void;
  onDeleteWordChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const needsReason = action === "suspend" || action === "archive";
  const isDelete = action === "delete";
  const isDanger = action === "archive" || isDelete;
  const deleteConfirmed = deleteWord.trim() === "DELETE";

  return (
    <div
      className={`rounded-md border p-4 space-y-3 ${
        isDanger
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/20"
      }`}
    >
      <p className="text-sm font-medium text-foreground">
        Confirm: {actionLabel(action)}
      </p>
      {isDelete && (
        <div className="space-y-1.5">
          <p className="text-xs text-destructive">
            This will permanently delete the account and all data. Type{" "}
            <strong>DELETE</strong> to confirm.
          </p>
          <input
            type="text"
            value={deleteWord}
            onChange={(e) => onDeleteWordChange(e.target.value)}
            placeholder="Type DELETE"
            className="w-full rounded-md border border-destructive/40 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
          />
        </div>
      )}
      {needsReason && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Reason{action === "archive" ? " *" : " (optional)"}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Enter a reason…"
            maxLength={280}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={
            pending ||
            (needsReason && action === "archive" && !reason.trim()) ||
            (isDelete && !deleteConfirmed)
          }
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            isDanger
              ? "bg-destructive text-white"
              : "bg-foreground text-background"
          }`}
        >
          {pending ? "Deleting…" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function actionLabel(action: ActionId): string {
  const map: Record<ActionId, string> = {
    suspend: "Suspend account",
    reactivate: "Reactivate account",
    archive: "Archive account",
    reset_onboarding: "Reset onboarding",
    password_reset: "Trigger password reset",
    delete: "Delete account permanently",
  };
  return map[action];
}

function actionDoneLabel(action: ActionId): string {
  const map: Record<ActionId, string> = {
    suspend: "Account suspended. Auth access blocked.",
    reactivate: "Account reactivated. Auth access restored.",
    archive: "Account archived and auth access blocked.",
    reset_onboarding: "Onboarding reset. Artist will see setup prompt again.",
    password_reset: "Password reset email queued.",
    delete: "Account permanently deleted.",
  };
  return map[action];
}
