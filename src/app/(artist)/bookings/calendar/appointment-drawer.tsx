"use client";

import { useState, startTransition } from "react";
import { editAppointmentAction, cancelAppointmentAction } from "./actions";
import Spinner from "@/components/spinner";
import { SIZES } from "@/lib/booking-schema";
import { formatDate } from "@/lib/format";

export type CalendarEvent = {
  id: string;
  date: string;
  handle: string;
  placement: string;
  size: string;
  description: string;
  email: string | null;
  origin: string;
  status: string;
};

type Props = {
  event: CalendarEvent | null;
  onClose: () => void;
  onCancelled: (id: string) => void;
};

export default function AppointmentDrawer({
  event,
  onClose,
  onCancelled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return null;

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await editAppointmentAction(event.id, fd);
      setSaving(false);
      if ("error" in result) {
        setError(result.error);
      } else {
        setEditing(false);
        onClose();
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelAppointmentAction(event.id);
      if ("error" in result) {
        setError(result.error);
      } else {
        onCancelled(event.id);
        onClose();
      }
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => {
          setEditing(false);
          setConfirmCancel(false);
          onClose();
        }}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-background border-l border-border flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-medium text-foreground">
            @{event.handle}
          </span>
          <button
            onClick={() => {
              setEditing(false);
              setConfirmCancel(false);
              onClose();
            }}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        {error && <p className="mx-5 mt-4 text-sm text-destructive">{error}</p>}

        {!editing ? (
          // View mode
          <div className="flex-1 px-5 py-5 space-y-5">
            <div className="space-y-3 text-sm">
              <Row label="date" value={formatDate(event.date)} />
              <Row label="placement" value={event.placement} />
              <Row label="size" value={event.size} />
              {event.email && <Row label="email" value={event.email} />}
              {event.description && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">description</span>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {event.description}
                  </p>
                </div>
              )}
              <Row
                label="origin"
                value={
                  event.origin === "artist_created"
                    ? "added by you"
                    : "booking request"
                }
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => setEditing(true)}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/30 transition-colors"
              >
                edit
              </button>

              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                >
                  cancel appointment
                </button>
              ) : (
                <div className="rounded-md border border-destructive/50 p-3 space-y-2">
                  <p className="text-sm text-foreground">
                    cancel this appointment?
                  </p>
                  {event.email && (
                    <p className="text-xs text-muted-foreground">
                      {event.email} will be notified
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                    >
                      yes, cancel
                    </button>
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      keep it
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Edit mode
          <form onSubmit={handleSave} className="flex-1 px-5 py-5 space-y-4">
            <Field
              label="instagram handle"
              name="customer_handle"
              defaultValue={event.handle}
              required
            />
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">date</label>
              <input
                name="preferred_date"
                type="date"
                defaultValue={event.date}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Field
              label="placement"
              name="placement"
              defaultValue={event.placement}
              required
            />
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">size</label>
              <select
                name="size"
                defaultValue={event.size}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                description
              </label>
              <textarea
                name="description"
                defaultValue={event.description}
                rows={3}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <Field
              label="customer email"
              name="customer_email"
              defaultValue={event.email ?? ""}
              type="email"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {saving ? <Spinner className="w-4 h-4 mx-auto" /> : "save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
              >
                cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-muted-foreground">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
