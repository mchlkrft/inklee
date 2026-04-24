import { redirect } from "next/navigation";

export default function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; leg?: string }>;
}) {
  void searchParams;
  redirect("/bookings/overview");
}
