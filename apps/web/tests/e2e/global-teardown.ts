/**
 * Deletes the artists this run seeded (profiles/bookings cascade). Best-effort
 * cleanup on the isolated e2e database; a crashed run may leave rows behind,
 * which is harmless there.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { deleteTestArtist } from "./helpers/seed";
import { SEED_FILE, type SeedFile } from "./global-setup";

export default async function globalTeardown() {
  if (!existsSync(SEED_FILE)) return;
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as SeedFile;
  await deleteTestArtist(seed.artistA.id);
  await deleteTestArtist(seed.artistB.id);
  rmSync(SEED_FILE, { force: true });
}
