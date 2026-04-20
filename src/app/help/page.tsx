import Link from "next/link";

const FAQ = [
  {
    q: "how do customers find my booking page?",
    a: "your booking page is at inklee.app/your-slug. share it in your instagram bio, stories, or anywhere you promote your work.",
  },
  {
    q: "do customers need to create an account?",
    a: "no. customers fill in the form and submit. they get a magic link by email to edit or cancel their request — no account required.",
  },
  {
    q: "what's the difference between preferred date and fixed slots?",
    a: "in preferred date mode, customers suggest a date and you decide. in fixed slots mode, you publish specific time slots and customers pick one. switch between them any time in profile settings.",
  },
  {
    q: "what happens when two customers try to book the same slot?",
    a: "the first submission locks the slot instantly. the second customer sees 'this slot is no longer available' and is asked to choose another.",
  },
  {
    q: "can i add appointments that were arranged via dm?",
    a: "yes. in the calendar, click '+ new appointment' to add any appointment directly. you can optionally enter a customer email to send them a confirmation.",
  },
  {
    q: "how do i export my bookings to google calendar or apple calendar?",
    a: "go to settings → calendar export, generate a feed link, and paste it into any calendar app that supports ical subscriptions.",
  },
  {
    q: "can customers edit their request after submitting?",
    a: "yes, but only while the request is still pending (before you approve or reject it). after that, they can only cancel.",
  },
  {
    q: "what emails does inklee send?",
    a: "customers receive a confirmation when they submit, and an email when you approve, reject, or cancel. you receive a notification for each new request. you can customise the email body in settings → email templates.",
  },
  {
    q: "is my data stored in europe?",
    a: "yes. inklee runs on supabase (frankfurt) and vercel (eu region). emails go through resend's eu infrastructure.",
  },
  {
    q: "how do i delete my account?",
    a: "email hello@inklee.app and we'll delete your account and all associated data within 30 days.",
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12 space-y-8">
        <div className="space-y-2">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">help</h1>
        </div>

        <div className="space-y-6">
          {FAQ.map(({ q, a }, i) => (
            <div
              key={i}
              className="space-y-2 border-b border-border pb-6 last:border-0"
            >
              <h2 className="text-sm font-medium text-foreground">{q}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {a}
              </p>
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          still have a question?{" "}
          <a
            href="mailto:hello@inklee.app"
            className="text-foreground underline underline-offset-4"
          >
            hello@inklee.app
          </a>
        </p>
      </main>
    </div>
  );
}
