import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreatePaymentRequestForm } from "./create-payment-request-form";

// Create a payment request (P9 artist UI, slice 2b-ii/iii). Fetches the artist's
// recent bookings + projects for the subject picker, then hands off to the client
// form. The subject ownership is re-enforced by the core's composite FK, so a
// tampered id cannot resolve to someone else's booking. Draft-only: creating does
// not send; the artist reviews then uses Send from the list/detail.
export const metadata = { title: "New payment request" };

export type SubjectOption = {
  value: string; // "booking:<id>" | "project:<id>"
  label: string;
};

function bookingLabel(row: {
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
}): string {
  const who = row.customer_handle || row.customer_email || "Client";
  return row.preferred_date ? `${who} · ${row.preferred_date}` : who;
}

export default async function NewPaymentRequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: bookings }, { data: projects }] = await Promise.all([
    supabase
      .from("booking_requests")
      .select("id, customer_handle, customer_email, preferred_date")
      .eq("artist_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("projects")
      .select("id, title")
      .eq("artist_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const subjectOptions: SubjectOption[] = [
    ...(bookings ?? []).map((b) => ({
      value: `booking:${b.id as string}`,
      label: `Appointment: ${bookingLabel(b)}`,
    })),
    ...(projects ?? []).map((p) => ({
      value: `project:${p.id as string}`,
      label: `Project: ${(p.title as string) || "Untitled project"}`,
    })),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <Link
        href="/bookings/payments"
        className="text-sm text-muted-foreground underline"
      >
        Back to payments
      </Link>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          New payment request
        </h1>
        <p className="text-sm text-muted-foreground">
          Build a draft for an appointment or project. Nothing is sent until you
          review it and choose Send.
        </p>
      </header>

      {subjectOptions.length === 0 ? (
        <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
          You need a booking or a project first. Create one, then come back to
          request a payment for it.
        </p>
      ) : (
        <CreatePaymentRequestForm subjectOptions={subjectOptions} />
      )}
    </div>
  );
}
