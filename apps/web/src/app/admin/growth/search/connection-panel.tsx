"use client";

import { useActionState } from "react";
import {
  disconnectGscAction,
  selectGscPropertyAction,
  startGscBackfillAction,
  triggerGscSyncAction,
} from "./actions";

// Mirrors the actions' state union (not importable: "use server" files must
// not re-export types).
type State = { error: string } | { ok: true } | null;

const primaryButton =
  "rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40";
const secondaryButton =
  "rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-40";

function StatusLine({
  state,
  pending,
  okText,
}: {
  state: State;
  pending: boolean;
  okText: string;
}) {
  if (pending || !state) return null;
  if ("error" in state) {
    return <p className="text-xs text-brand-red">{state.error}</p>;
  }
  return <p className="text-xs text-brand-green">{okText}</p>;
}

/**
 * Interactive Search Console connection management: property choice, manual
 * sync, backfill, disconnect. All validation and authorization live in the
 * server actions; this leaf only renders pending/error/success states.
 * The connect flow itself is a plain server redirect (/api/admin/gsc/connect),
 * not part of this component.
 */
export default function ConnectionPanel({
  properties,
  hasActiveProperty,
}: {
  properties: {
    id: string;
    siteUrl: string;
    permissionLevel: string | null;
    isActive: boolean;
  }[];
  hasActiveProperty: boolean;
}) {
  const [selectState, selectAction, selectPending] = useActionState<
    State,
    FormData
  >(selectGscPropertyAction, null);
  const [backfillState, backfillAction, backfillPending] = useActionState<
    State,
    FormData
  >(startGscBackfillAction, null);
  const [syncState, syncAction, syncPending] = useActionState<State, FormData>(
    () => triggerGscSyncAction(),
    null,
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState<
    State,
    FormData
  >(() => disconnectGscAction(), null);

  return (
    <div className="space-y-5">
      {properties.length > 0 && (
        <form action={selectAction} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Property</p>
          <div className="space-y-1.5">
            {properties.map((property) => (
              <label
                key={property.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3"
              >
                <input
                  type="radio"
                  name="property_id"
                  value={property.id}
                  defaultChecked={property.isActive}
                  required
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block break-all text-sm text-foreground">
                    {property.siteUrl}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {property.permissionLevel
                      ? `Permission: ${property.permissionLevel}`
                      : "Permission level unknown"}
                    {property.isActive ? " · currently active" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={selectPending}
            className={primaryButton}
          >
            {selectPending ? "Saving…" : "Use this property"}
          </button>
          <StatusLine
            state={selectState}
            pending={selectPending}
            okText="Property selected."
          />
        </form>
      )}

      {hasActiveProperty && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sync</p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={syncAction}>
              <button
                type="submit"
                disabled={syncPending}
                className={primaryButton}
              >
                {syncPending ? "Syncing…" : "Sync now"}
              </button>
            </form>
            <form
              action={backfillAction}
              className="flex flex-wrap items-center gap-2"
            >
              <button
                type="submit"
                name="mode"
                value="90"
                disabled={backfillPending}
                className={secondaryButton}
              >
                {backfillPending ? "Starting…" : "Backfill 90 days"}
              </button>
              <button
                type="submit"
                name="mode"
                value="all"
                disabled={backfillPending}
                className={secondaryButton}
              >
                Backfill all history
              </button>
            </form>
          </div>
          <StatusLine
            state={syncState}
            pending={syncPending}
            okText="Sync finished."
          />
          <StatusLine
            state={backfillState}
            pending={backfillPending}
            okText="Backfill started. The daily sync advances it in batches; Sync now advances one batch immediately."
          />
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <form action={disconnectAction}>
          <button
            type="submit"
            disabled={disconnectPending}
            className="rounded-full border border-brand-red/40 px-3 py-1.5 text-xs text-brand-red transition-colors hover:bg-brand-red/10 disabled:opacity-40"
          >
            {disconnectPending ? "Disconnecting…" : "Disconnect"}
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Disconnecting retires the stored token. Already synced data stays.
        </p>
        <StatusLine
          state={disconnectState}
          pending={disconnectPending}
          okText="Disconnected."
        />
      </div>
    </div>
  );
}
