import FlashDayForm from "../flash-day-form";

export default function NewFlashDayPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          New flash day
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Group flash items into a scheduled event.
        </p>
      </div>
      <FlashDayForm />
    </div>
  );
}
