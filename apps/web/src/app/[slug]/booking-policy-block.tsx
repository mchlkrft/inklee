// The artist's booking / deposit / cancellation policy, free text edited in the
// Link Hub editor (/link-hub). Renders below the booking section. Server
// component; only mounted when the policy is set and the module is visible.

export default function BookingPolicyBlock({ policy }: { policy: string }) {
  return (
    <section className="space-y-2 rounded-[20px] border border-border px-5 py-4">
      <h2 className="text-sm font-semibold text-foreground">Booking policy</h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {policy}
      </p>
    </section>
  );
}
