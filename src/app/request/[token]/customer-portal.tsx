"use client";

import DateInput from "@/components/date-input";
import { useActionState, useState, lazy, Suspense } from "react";
import {
  editCustomerBookingAction,
  cancelCustomerBookingAction,
} from "./actions";
import { SIZES } from "@/lib/booking-schema";
import { formatDate } from "@/lib/format";
import StatusBadge from "@/components/status-badge";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { HONEYPOT_FIELD } from "@/lib/honeypot";

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
  bookingModeLabel: string;
  canEdit: boolean;
  editDisabledReason: string | null;
  depositAmount: number | null;
  depositDueAt: string | null;
  depositNote: string | null;
  depositClientSecret: string | null;
  stripePublishableKey: string | null;
};

const tomorrow = () => {
  return addDaysToDateKey(localDateKey(), 1);
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
            Edit your request
          </h1>
          <button
            onClick={() => {
              setMode("view");
            }}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Cancel edit
          </button>
        </div>

        <form action={editAction} className="space-y-5">
          <input type="hidden" name="_token" value={booking.token} />
          <input
            name={HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute h-px w-px overflow-hidden -left-[9999px] top-auto"
          />

          {editState?.error && !editState.field && (
            <p className="text-sm text-destructive">{editState.error}</p>
          )}

          <Field
            label="Instagram handle"
            name="instagram_handle"
            defaultValue={booking.handle}
            prefix="@"
            required
            err={err("instagram_handle")}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={booking.email}
            required
            err={err("email")}
          />
          <Field
            label="Reference link"
            name="reference_link"
            type="url"
            defaultValue={booking.referenceLink ?? ""}
            placeholder="instagram.com/p/... or any link"
            err={err("reference_link")}
          />
          <Field
            label="Placement"
            name="placement"
            defaultValue={booking.placement}
            required
            err={err("placement")}
          />

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Size <span className="text-foreground">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map((s) => (
                <label
                  key={s}
                  className="cursor-pointer rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground has-[:checked]:border-foreground has-[:checked]:text-foreground"
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="size"
                      value={s}
                      required
                      defaultChecked={booking.size === s}
                      className="accent-foreground"
                    />
                    {s}
                  </div>
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
                Description <span className="text-foreground">*</span>
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
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              Preferred date <span className="text-foreground">*</span>
            </label>
            <DateInput
              id="preferred_date"
              name="preferred_date"
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
            className="w-full rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {editPending ? "Saving..." : "Save changes"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            After saving, a new confirmation email will be sent with an updated
            link.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          Your booking request
        </h1>
        <p className="text-sm text-muted-foreground">
          Sent to {booking.artistName}
        </p>
      </div>

      <div className="divide-y divide-border rounded-md border border-border text-sm">
        <Row label="Status">
          <StatusBadge status={booking.status} />
        </Row>
        <Row label="Instagram" value={`@${booking.handle}`} />
        <Row label="Booking type" value={booking.bookingModeLabel} />
        <Row label="Placement" value={booking.placement} />
        <Row label="Size" value={booking.size} />
        <Row label="Preferred date" value={formatDate(booking.preferredDate)} />
        {booking.referenceLink && (
          <Row label="Reference">
            <a
              href={booking.referenceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-foreground underline underline-offset-4"
            >
              {booking.referenceLink}
            </a>
          </Row>
        )}
        {booking.description && (
          <div className="space-y-1 px-4 py-3">
            <span className="text-muted-foreground">Description</span>
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">
              {booking.description}
            </p>
          </div>
        )}
      </div>

      {booking.depositAmount && booking.status === "deposit_pending" && (
        <div className="space-y-3">
          {booking.depositClientSecret && booking.stripePublishableKey ? (
            <Suspense
              fallback={
                <p className="text-sm text-muted-foreground">
                  Loading payment...
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
            <div className="space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Deposit requested
              </p>
              <p className="text-sm text-foreground">
                {booking.artistName} has requested a deposit of{" "}
                <span className="font-medium">
                  EUR {booking.depositAmount.toFixed(2)}
                </span>
                {booking.depositDueAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    - due by {formatDate(booking.depositDueAt)}
                  </span>
                )}
              </p>
              {booking.depositNote && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {booking.depositNote}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Once your deposit is received, {booking.artistName} will confirm
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
          {isPending && booking.canEdit && (
            <button
              onClick={() => setMode("edit")}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/30"
            >
              Edit request
            </button>
          )}

          {isPending && !booking.canEdit && booking.editDisabledReason && (
            <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
              {booking.editDisabledReason}
            </div>
          )}

          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            >
              Cancel request
            </button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive/50 p-4">
              <p className="text-sm text-foreground">Cancel this request?</p>
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
                  {cancelPending ? "Cancelling..." : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground"
                >
                  Keep it
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
    <div className="flex gap-4 px-4 py-3">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">
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
        {required && <span className="ml-0.5 text-foreground">*</span>}
      </label>
      {prefix ? (
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2.5 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="select-none text-muted-foreground">{prefix}</span>
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
