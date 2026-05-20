import Link from "next/link";

/**
 * Public Booking Page Client Notice — verbatim from legal/LEGAL-PACKAGE-DRAFT.md
 * Section 8. Rendered at the bottom of every `/[slug]` public artist page above
 * the page footer. Contains the exact required deposit wording.
 *
 * Counsel-cleared 2026-05-20 under the global sign-off umbrella.
 *
 * Not a standalone route — this notice intentionally lives on the booking page,
 * not at `/public-booking-notice` etc. If a `/data-requests` route ships later,
 * §3 should gain a `/data-requests` link per the legal-package implementation
 * notes (Section 17.2).
 */
export function PublicBookingLegalNotice() {
  return (
    <section
      aria-labelledby="public-booking-legal-notice-heading"
      className="space-y-4 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground"
    >
      <h2
        id="public-booking-legal-notice-heading"
        className="text-base font-medium text-foreground"
      >
        Notice for people submitting a booking request through Inklee
      </h2>

      <p>
        When you submit this form, the request is sent to the tattoo artist
        whose page you are on. Please read the short notes below before
        submitting.
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          1. What this form does
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The form is provided by Inklee, a technical service used by the
            artist to receive booking requests.
          </li>
          <li>
            Submitting the form is <strong>not</strong> a confirmed booking. The
            artist decides whether to accept, decline, propose changes, or
            cancel.
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          2. Who provides the tattoo service
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The tattoo service itself is provided by the artist, not by Inklee.
          </li>
          <li>
            The artist sets their own pricing, deposits, cancellation,
            rescheduling, refund, aftercare, age-verification, and
            health-and-safety policies. Inklee does not set or enforce those
            policies.
          </li>
          <li>
            Please contact the artist directly with any questions about the
            tattoo, the appointment, or any deposit they may ask for.
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          3. What happens to your information
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The artist receives the information you submit and uses it to review
            your request.
          </li>
          <li>
            Inklee processes that information on the artist&apos;s behalf so
            that the artist can read, respond to, and manage your request
            through the Service. This is described in our{" "}
            <Link
              href="/privacy"
              className="text-foreground underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </li>
          <li>
            You will receive a confirmation email from Inklee. It contains a
            link you can use to update your request before the artist has
            approved it, and to cancel your request at any time.
          </li>
          <li>
            Please do not submit information that is not needed for the request
            — in particular sensitive personal information (e.g. detailed
            medical history) that the artist has not asked for.
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          4. Deposits and payments
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Inklee is built to make deposits part of the booking flow.
            Availability depends on your current setup and enabled features.
          </li>
          <li>
            Any deposit you may be asked to pay is between you and the artist.
            Inklee is not the seller of the tattoo service and does not decide
            whether a deposit is refundable.
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          5. Who to contact
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Questions about your appointment, tattoo, or deposit → contact the
            artist.
          </li>
          <li>
            Questions about the platform, privacy, or security → contact Inklee
            at{" "}
            <a
              href="mailto:support@inklee.app"
              className="text-foreground underline underline-offset-4"
            >
              support@inklee.app
            </a>
            .
          </li>
        </ul>
      </div>
    </section>
  );
}
