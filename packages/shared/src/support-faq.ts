// FAQ content for the artist support page. Structured configuration so the
// page component stays free of copy and entries are easy to add or reorder.
// Each answer may point at a relevant setting, but the FAQ never replaces
// ticket creation.

export type SupportFaqItem = {
  question: string;
  answer: string;
  /** Optional in-app destination that helps with this problem. */
  href?: string;
  linkLabel?: string;
};

export const SUPPORT_FAQ: SupportFaqItem[] = [
  {
    // You are signed in to read this, so the "locked out of everything" case
    // cannot land here. Framed for what a signed-in artist actually hits: a
    // second device, the app, or a teammate who is locked out.
    question: "I am locked out on my phone or another device",
    answer:
      "You are signed in here, so you can still get help. Resetting your password updates it everywhere you sign in, including the app. If you signed up with Google, use the Google button rather than a password. For a locked teammate or a separate account, describe it in the form below and we will help.",
    href: "/forgot-password",
    linkLabel: "Reset your password",
  },
  {
    question: "My booking page is not working",
    answer:
      "Check that your books are open and that your booking link uses your current page address. Your public page updates within a minute of saving changes. If clients report errors when submitting, include the exact error text in a ticket.",
    href: "/bookings/public-page",
    linkLabel: "Open public page settings",
  },
  {
    question: "A client did not receive an email",
    answer:
      "Ask the client to check their spam folder first. Emails send from the inklee.app domain. If several clients report missing emails, submit a ticket with one affected booking so we can trace the delivery.",
  },
  {
    question: "My calendar or availability looks incorrect",
    answer:
      "Appointments, slots, and guest spot dates all feed the calendar. Check your slots and any active trips before reporting. If a specific day shows wrong availability, include the date and what you expected in a ticket.",
    href: "/bookings/calendar",
    linkLabel: "Open your calendar",
  },
  {
    question: "A deposit or payment is missing",
    answer:
      "Deposits can take a moment to confirm after the client pays. Check the booking's detail page for the deposit state. If a client paid and the booking still shows the deposit as due after an hour, submit a ticket with the booking and we will trace the payment. Never share card numbers in a ticket.",
    href: "/bookings/deposits",
    linkLabel: "Open the deposits overview",
  },
  {
    question: "When will I receive my deposit money?",
    answer:
      "Client deposits pay out to your own bank account through Stripe, on the payout schedule Stripe sets for your account. Deposits only reach you once your payout details are complete and verified. If a payout looks late, or your account still needs details, check your payout settings first, then submit a ticket with the booking reference.",
    href: "/settings/payouts",
    linkLabel: "Open payout settings",
  },
  {
    question: "The mobile app is not updating",
    answer:
      "Force-close and reopen the app first, then check for an update in your store. Your data lives on your account, not the device, so reinstalling is safe. If a screen shows stale data after that, tell us which screen in a ticket.",
  },
  {
    question: "How do I change my booking form?",
    answer:
      "You can edit fields, requirements, and the questions clients answer under booking form settings. Changes apply to new requests immediately.",
    href: "/bookings/form",
    linkLabel: "Open booking form settings",
  },
  {
    question: "How do I delete my account or export my data?",
    answer:
      "You can download your data from the export page in settings, and request permanent account deletion from your account settings. Deletion removes your public page, bookings, and history and cannot be undone, so export anything you want to keep first.",
    href: "/settings/account",
    linkLabel: "Open account settings",
  },
  {
    question: "How do I report a bug?",
    answer:
      "Use the form below with the category set to bug or technical problem. The most useful reports say what you did, what you expected, and what happened instead, plus the page it happened on.",
  },
];
