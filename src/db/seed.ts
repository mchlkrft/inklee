import "dotenv/config";
import { db } from "./index";
import { profiles } from "./schema";

async function seed() {
  console.log("seeding...");

  await db
    .insert(profiles)
    .values({
      id: "00000000-0000-0000-0000-000000000001",
      slug: "demo",
      displayName: "Demo Artist",
      instagramHandle: "demo.artist",
      bio: "This is a demo artist account for testing.",
      timezone: "Europe/Berlin",
      location: "Berlin",
    })
    .onConflictDoNothing();

  console.log("seed complete");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
