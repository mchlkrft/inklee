import { redirect } from "next/navigation";

// New-flash-item creation moved 2026-05-24 from this dedicated subpage to a
// lightweight modal (`flash-quick-create-modal.tsx`) on /flash/items. The
// old route stays as a redirect so any cached bookmarks or in-app links
// still land in the right place; an artist who opens the modal can still
// access the full field set via the "More settings" disclosure.
export default function NewFlashItemRedirect() {
  redirect("/flash/items");
}
