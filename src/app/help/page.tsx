import Link from "next/link";

const FAQ = [
  {
    q: "How do customers find my booking page?",
    a: "Your booking page is at inklee.app/your-slug. Share it in your Instagram bio, stories, or anywhere you promote your work.",
  },
  {
    q: "Do customers need to create an account?",
    a: "No. Customers fill in the form and submit. They get a magic link by email to edit or cancel their request - no account required.",
  },
  {
    q: "What's the difference between preferred date and fixed slots?",
    a: "In preferred date mode, customers suggest a date and you decide. In fixed slots mode, you publish specific time slots and customers pick one. Switch between them any time in profile settings.",
  },
  {
    q: "What happens when two customers try to book the same slot?",
    a: "The first submission locks the slot instantly. The second customer sees 'This slot is no longer available' and is asked to choose another.",
  },
  {
    q: "Can I add appointments that were arranged via DM?",
    a: "Yes. In the calendar, click '+ New appointment' to add any appointment directly. You can optionally enter a customer email to send them a confirmation.",
  },
  {
    q: "How do I export my bookings to Google Calendar or Apple Calendar?",
    a: "Go to Settings -> Calendar export, generate a feed link, and paste it into any calendar app that supports iCal subscriptions.",
  },
  {
    q: "Can customers edit their request after submitting?",
    a: "Yes, but only while the request is still pending (before you approve or reject it). After that, they can only cancel.",
  },
  {
    q: "What emails does inklee send?",
    a: "Customers receive a confirmation when they submit, and an email when you approve, reject, or cancel. You receive a notification for each new request. You can customize the email body in Settings -> Email templates.",
  },
  {
    q: "Is my data stored in Europe?",
    a: "Yes. inklee runs on Supabase (Frankfurt) and Vercel (EU region). Emails go through Resend's EU infrastructure.",
  },
  {
    q: "How do I delete my account?",
    a: "Email support@inklee.app and we'll delete your account and all associated data within 30 days.",
  },
];

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex-1 w-full max-w-2xl space-y-8 px-6 py-12">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Help</h1>
        </div>

        <div className="space-y-6">
          {FAQ.map(({ q, a }, i) => (
            <div
              key={i}
              className="space-y-2 border-b border-border pb-6 last:border-0"
            >
              <h2 className="text-sm font-medium text-foreground">{q}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {a}
              </p>
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Still have a question?{" "}
          <a
            href="mailto:support@inklee.app"
            className="text-foreground underline underline-offset-4"
          >
            support@inklee.app
          </a>
        </p>
      </main>
    </div>
  );
}
