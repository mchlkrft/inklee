import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex justify-end px-6 py-4">
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-xl space-y-8">
          <h1 className="text-5xl font-semibold tracking-tight text-foreground">
            inklee
          </h1>
          <p className="text-lg text-muted-foreground">
            booking requests without the dm chaos
          </p>
          <button
            disabled
            className="inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium bg-foreground text-background opacity-90 cursor-not-allowed"
          >
            sign up
          </button>
        </div>
      </main>

      <footer className="px-6 py-8 flex justify-center gap-6 text-sm text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground transition-colors">
          terms
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          privacy
        </Link>
        <Link
          href="/impressum"
          className="hover:text-foreground transition-colors"
        >
          impressum
        </Link>
      </footer>
    </div>
  );
}
