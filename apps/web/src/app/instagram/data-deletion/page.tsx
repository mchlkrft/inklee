import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Instagram data deletion",
  robots: { index: false, follow: false },
};

// Public status page for Meta's data-deletion callback confirmation URL.
// Deletion runs synchronously inside the callback, so any request that reaches
// this page with a confirmation code has already been completed.
export default async function InstagramDataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Instagram data deletion
        </h1>
        {code ? (
          <p className="text-sm text-muted-foreground">
            Your deletion request has been completed. The Instagram connection,
            the stored access token, the synced post list, and the cached
            thumbnail images have been deleted from Inklee.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This page confirms Instagram data deletion requests forwarded to
            Inklee by Meta. When you remove Inklee from your Instagram account
            or ask Meta to delete your data, we delete the Instagram connection,
            the stored access token, the synced post list, and the cached
            thumbnail images automatically.
          </p>
        )}
      </div>

      {code ? (
        <div className="rounded-md border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Confirmation code</p>
          <p className="font-mono text-sm text-foreground">{code}</p>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Flash designs you imported earlier stay in your account, including their
        copied image and the link to the original post. You can delete them from
        your flash library at any time.
      </p>

      <p className="text-xs text-muted-foreground">
        Details in our{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-4 hover:text-foreground"
        >
          privacy policy
        </Link>
        . Questions? Visit the{" "}
        <Link
          href="/help"
          className="underline underline-offset-4 hover:text-foreground"
        >
          help page
        </Link>
        .
      </p>
    </main>
  );
}
