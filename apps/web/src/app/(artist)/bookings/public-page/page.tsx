import { redirect } from "next/navigation";

export default function PublicPageManagementPage() {
  redirect("/bookings/booking-form");
}
