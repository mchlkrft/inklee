import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <Link
          href="/"
          className="block text-center text-2xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        {children}
      </div>
    </div>
  );
}
