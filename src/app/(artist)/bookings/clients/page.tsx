import { redirect } from "next/navigation";

export default function ClientsPage() {
  redirect("/bookings/overview?view=clients");
}
