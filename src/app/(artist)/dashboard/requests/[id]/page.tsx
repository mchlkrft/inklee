import { redirect } from "next/navigation";
export default function OldRequestDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return params.then(({ id }) => redirect(`/bookings/requests/${id}`));
}
