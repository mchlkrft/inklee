import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function PingPage() {
  const demo = await db.query.profiles.findFirst({
    where: eq(profiles.slug, "demo"),
  });

  return (
    <div className="p-8 font-mono text-sm">
      <p className="text-muted-foreground mb-2">db ping</p>
      {demo ? (
        <pre className="text-foreground">{JSON.stringify(demo, null, 2)}</pre>
      ) : (
        <p className="text-destructive">
          demo artist not found — run pnpm db:seed
        </p>
      )}
    </div>
  );
}
