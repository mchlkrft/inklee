import { redirect } from "next/navigation";
export default function OldClientDetailRoute({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  return params.then(({ email }) => redirect(`/bookings/clients/${email}`));
}
