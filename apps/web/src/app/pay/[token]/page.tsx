import crypto from "crypto";
import Link from "next/link";
import { serviceClient } from "@/lib/supabase/service";
import {
  buildPaymentQuote,
  type PaymentQuote,
} from "@/lib/server/appointment-payment-quote";
import { createPaymentRequestIntentCore } from "@/lib/server/appointment-payment-intent";
import PaymentForm from "./payment-form";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

type PageState =
  | {
      type: "payable";
      quote: PaymentQuote;
      clientSecret: string;
      artistName: string;
      stripePublishableKey: string;
    }
  | { type: "paid"; artistName: string }
  | { type: "expired" }
  | { type: "not-found" }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashToken(token);

  const { data: request } = await serviceClient
    .from("payment_requests")
    .select(
      `
      id, status, artist_id, expires_at,
      profiles!artist_id(display_name)
    `,
    )
    .eq("customer_token_hash", tokenHash)
    .maybeSingle();

  let state: PageState;

  if (!request) {
    state = { type: "not-found" };
  } else {
    const profile = Array.isArray(request.profiles)
      ? request.profiles[0]
      : request.profiles;
    const artistName =
      (profile as { display_name: string } | null)?.display_name ??
      "the artist";

    if (request.status === "cancelled") {
      state = { type: "cancelled" };
    } else if (
      request.expires_at &&
      new Date(request.expires_at) <= new Date()
    ) {
      state = { type: "expired" };
    } else if (
      request.status === "paid" ||
      request.status === "refunded" ||
      request.status === "partially_refunded"
    ) {
      state = { type: "paid", artistName };
    } else {
      if (request.status === "sent") {
        await serviceClient
          .from("payment_requests")
          .update({ status: "viewed", updated_at: new Date().toISOString() })
          .eq("id", request.id)
          .eq("status", "sent");
      }

      const quoted = await buildPaymentQuote(serviceClient, request.id);
      if (!quoted.ok) {
        state = { type: "error", message: quoted.error };
      } else {
        const intentResult = await createPaymentRequestIntentCore(
          serviceClient,
          request.id,
        );
        if (!intentResult.ok) {
          state = { type: "error", message: intentResult.error };
        } else {
          const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
          if (!publishableKey) {
            state = {
              type: "error",
              message:
                "Card payments aren't available right now. Please try again later.",
            };
          } else {
            state = {
              type: "payable",
              quote: quoted.quote,
              clientSecret: intentResult.clientSecret,
              artistName,
              stripePublishableKey: publishableKey,
            };
          }
        }
      }
    }
  }

  if (state.type === "payable") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 block text-center text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <PaymentForm
            quote={{
              amountMinor: state.quote.amountMinor,
              totalMinor: state.quote.totalMinor,
              alreadyCollectedMinor: state.quote.alreadyCollectedMinor,
              currency: state.quote.currency,
              collects: state.quote.collects,
              lines: state.quote.lines.map((l) => ({
                id: l.id,
                name: l.name,
                quantity: l.quantity,
                unitAmountMinor: l.unitAmountMinor,
                lineTotalMinor: l.lineTotalMinor,
              })),
            }}
            artistName={state.artistName}
            clientSecret={state.clientSecret}
            stripePublishableKey={state.stripePublishableKey}
          />
        </div>
      </div>
    );
  }

  if (state.type === "paid") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Link
            href="/"
            className="mb-8 block text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <h1 className="text-lg font-semibold text-foreground">
            Payment received
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your payment to {state.artistName} has been received. You can close
            this page.
          </p>
        </div>
      </div>
    );
  }

  const messages: Record<
    Exclude<PageState["type"], "payable" | "paid">,
    { headline: string; body: string }
  > = {
    expired: {
      headline: "Link expired",
      body: "This payment link has expired. Contact the artist for a new one.",
    },
    cancelled: {
      headline: "Payment cancelled",
      body: "This payment request has been cancelled by the artist.",
    },
    "not-found": {
      headline: "Link not found",
      body: "This payment link doesn't match any request. It may be invalid or mistyped.",
    },
    error: {
      headline: "Something went wrong",
      body:
        state.type === "error"
          ? state.message
          : "Please try again in a moment.",
    },
  };

  const { headline, body } = messages[state.type];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <Link
          href="/"
          className="mb-8 block text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        <h1 className="text-lg font-semibold text-foreground">{headline}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
