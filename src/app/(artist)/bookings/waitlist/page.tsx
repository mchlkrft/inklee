import { redirect } from "next/navigation";

// Waitlist moved 2026-05-24 to a tab on /bookings/overview alongside
// Requests + Clients — it took up sidebar space it didn't earn for
// most artists. The standalone page lives on as a redirect so any
// bookmarks or in-app links still resolve.
export default function WaitlistRedirect() {
  redirect("/bookings/overview?view=waitlist");
}
