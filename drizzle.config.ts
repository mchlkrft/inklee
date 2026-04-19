import type { Config } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local, so we load it here
try {
  process.loadEnvFile(".env.local");
} catch {
  /* not present */
}

export default {
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
