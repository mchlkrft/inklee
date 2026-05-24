import { redirect } from "next/navigation";
export default function OldWaitlistRoute() {
  redirect("/bookings/overview?view=waitlist");
}
