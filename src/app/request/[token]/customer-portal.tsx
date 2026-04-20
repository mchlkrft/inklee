"use client";

import { useActionState, useState, lazy, Suspense } from "react";
import {
  editCustomerBookingAction,
  cancelCustomerBookingAction,
} from "./actions";
import { SIZES } from "@/lib/booking-schema";
import { formatDate } from "@/lib/format";
import StatusBadge from "@/components/status-badge";

const DepositPaymentForm = lazy(
  () => import("@/components/deposit-payment-form"),
);

type Booking = {
  id: string;
  token: string;
  status: string;
  handle: string;
  email: string;
  placement: string;
  size: string;
  description: string;
  referenceLink: string | null;
  preferredDate: string;
  artistName: string;
  depositAmount: number | null;
  depositDueAt: string | null;
  depositNote: string | null;
  depositClientSecret: string | null;
  stripePublishableKey: string | null;
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

export default function CustomerPortal({ booking }: { booking: Booking }) {
  const [editState, editAction, editPending] = useActionState<
    { error: string; field?: string } | null,
    FormData
  >(editCustomerBookingAction, null);

  const [cancelState, cancelAction, cancelPending] = useActionState<
    { error: string } | null,
    FormData
  >(cancelCustomerBookingAction, null);

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [description, setDescription] = useState(booking.description);

  const isPending = booking.status === "pending";
  const isCancelled = booking.status === "cancelled";

  const err = (field: string) =>
    editState && "field" in editState && editState.field === field
      ? editState.error
      : null;

  if (mode === "edit") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            edit your request
          </h1>
          <button
            onClick={() => {
              setMode("view");
            }}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            cancel edit
          </button>
        </div>

        <form action={editAction} className="space-y-5">
          <input type="hidden" name="_token" value={booking.token} />
          <input
            name="website"
            type="text"
            tabIndex={-1}
            className="hidden"
            aria-hidden
          />

          {editState?.error && !editState.field && (
            <p className="text-sm text-destructive">{editState.error}</p>
          )}

          <Field
            label="instagram handle"
            name="instagram_handle"
            defaultValue={booking.handle}
            prefix="@"
            required
            err={err("instagram_handle")}
          />
          <Field
            label="email"
            name="email"
            type="email"
            defaultValue={booking.email}
            required
            err={err("email")}
          />
          <Field
            label="reference link"
            name="reference_link"
            type="url"
            defaultValue={booking.referenceLink ?? ""}
            placeholder="instagram.com/p/… or any link"
            err={err("reference_link")}
          />
          <Field
            label="placement"
            name="placement"
            defaultValue={booking.placement}
            required
            err={err("placement")}
          />

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              size <span className="text-foreground">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm cursor-pointer has-[:checked]:border-foreground has-[:checked]:text-foreground text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="size"
                    value={s}
                    required
                    defaultChecked={booking.size === s}
                    className="accent-foreground"
                  />
                  {s}
                </label>
              ))}
            </div>
            {err("size") && (
              <p className="text-xs text-destructive">{err("size")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label
                htmlFor="description"
                className="text-sm text-muted-foreground"
              >
                description <span className="text-foreground">*</span>
              </label>
              <span
                className={`text-xs ${description.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {description.length}/1000
              </span>
            </div>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            {err("description") && (
              <p className="text-xs text-destructive">{err("description")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="preferred_date"
              className="text-sm text-muted-foreground"
            >
              preferred date <span className="text-foreground">*</span>
            </label>
            <input
              id="preferred_date"
              name="preferred_date"
              type="date"
              required
              defaultValue={booking.preferredDate}
              min={tomorrow()}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {err("preferred_date") && (
              <p className="text-xs text-destructive">
                {err("preferred_date")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={editPending}
            className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {editPending ? "saving…" : "save changes"}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            after saving, a new confirmation email will be sent with an updated
            link
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          your booking request
        </h1>
        <p className="text-sm text-muted-foreground">
          sent to {booking.artistName}
        </p>
      </div>

      <div className="rounded-md border border-border divide-y divide-border text-sm">
        <Row label="status">
          <StatusBadge status={booking.status} />
        </Row>
        <Row label="instagram" value={`@${booking.handle}`} />
        <Row label="placement" value={booking.placement} />
        <Row label="size" value={booking.size} />
        <Row label="preferred date" value={formatDate(booking.preferredDate)} />
        {booking.referenceLink && (
          <Row label="reference">
            <a
              href={booking.referenceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 text-foreground break-all"
            >
              {booking.referenceLink}
            </a>
          </Row>
        )}
        {booking.description && (
          <div className="px-4 py-3 space-y-1">
            <span className="text-muted-foreground">description</span>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {booking.description}
            </p>
          </div>
        )}
      </div>

      {/* Deposit block */}
      {booking.depositAmount && booking.status === "deposit_pending" && (
        <div className="space-y-3">
          {booking.depositClientSecret && booking.stripePublishableKey ? (
            <Suspense
              fallback={
                <p className="text-sm text-muted-foreground">
                  loading payment…
                </p>
              }
            >
              <DepositPaymentForm
                publishableKey={booking.stripePublishableKey}
                clientSecret={booking.depositClientSecret}
                amountEur={booking.depositAmount}
              />
            </Suspense>
          ) : (
            <div className="rounded-md border border-border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                deposit requested
              </p>
              <p className="text-sm text-foreground">
                {booking.artistName} has requested a deposit of{" "}
                <span className="font-medium">
                  €{booking.depositAmount.toFixed(2)}
                </span>
                {booking.depositDueAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    — due by {formatDate(booking.depositDueAt)}
                  </span>
                )}
              </p>
              {booking.depositNote && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {booking.depositNote}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                once your deposit is received, {booking.artistName} will confirm
                your booking.
              </p>
            </div>
          )}
        </div>
      )}

      {cancelState?.error && (
        <p className="text-sm text-destructive">{cancelState.error}</p>
      )}

      {!isCancelled && (
        <div className="space-y-3">
          {isPending && (
            <button
              onClick={() => setMode("edit")}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:bg-muted/30 transition-colors"
            >
              edit request
            </button>
          )}

          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              cancel request
            </button>
          ) : (
            <div className="rounded-md border border-destructive/50 p-4 space-y-3">
              <p className="text-sm text-foreground">cancel this request?</p>
              <p className="text-xs text-muted-foreground">
                {booking.artistName} will be notified.
              </p>
              <form action={cancelAction} className="flex gap-2">
                <input type="hidden" name="_token" value={booking.token} />
                <button
                  type="submit"
                  disabled={cancelPending}
                  className="rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {cancelPending ? "cancelling…" : "yes, cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground"
                >
                  keep it
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex px-4 py-3 gap-4">
      <span className="text-muted-foreground w-28 shrink-0 text-sm">
        {label}
      </span>
      {children ?? <span className="text-sm text-foreground">{value}</span>}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  prefix,
  placeholder,
  err,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  prefix?: string;
  placeholder?: string;
  err?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-muted-foreground">
        {label}
        {required && <span className="text-foreground ml-0.5">*</span>}
      </label>
      {prefix ? (
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="text-muted-foreground select-none">{prefix}</span>
          <input
            name={name}
            type={type}
            defaultValue={defaultValue}
            required={required}
            className="flex-1 bg-transparent text-foreground focus:outline-none"
          />
        </div>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
