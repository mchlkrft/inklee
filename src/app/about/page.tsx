import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-8">
        <Link
          href="/"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <h1 className="text-xl font-semibold text-foreground">about</h1>
          <p>
            inklee is a booking request tool built for freelance and traveling
            tattoo artists. no more managing DMs, spreadsheets, or missed
            messages.
          </p>
          <p>
            artists get a clean public page where customers can send a proper
            booking request — with all the details you actually need before
            saying yes.
          </p>
          <p>built by a tattoo artist, for tattoo artists.</p>
        </div>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          get started
        </Link>
      </div>
    </div>
  );
}
