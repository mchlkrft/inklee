import { redirect } from "next/navigation";

// The bio-page editor became the standalone "Link Hub" (Tools nav) at /link-hub
// (ME-11). Keep this redirect so old bookmarks / links don't 404.
export default function BioPageRedirect() {
  redirect("/link-hub");
}
