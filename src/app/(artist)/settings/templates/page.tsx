import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_BODIES,
  DEFAULT_SUBJECTS,
  ALLOWED_VARS,
} from "@/lib/email/booking-templates";
import TemplateEditor from "./template-editor";

const TEMPLATE_TYPES = [
  {
    type: "customer_booking_submitted",
    label: "booking received (→ customer)",
  },
  { type: "customer_booking_approved", label: "booking approved (→ customer)" },
  { type: "customer_booking_rejected", label: "booking rejected (→ customer)" },
  {
    type: "customer_booking_cancelled_by_artist",
    label: "you cancelled (→ customer)",
  },
  { type: "artist_new_booking_request", label: "new request (→ you)" },
] as const;

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: saved } = await supabase
    .from("email_templates")
    .select("type, body")
    .eq("artist_id", user!.id);

  const savedMap = Object.fromEntries(
    (saved ?? []).map((t) => [t.type, t.body]),
  );

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          email templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          customise the body of each email. subject lines and layout are fixed.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          available variables:{" "}
          {ALLOWED_VARS.map((v) => (
            <code key={v} className="mr-1.5 font-mono">{`{{${v}}}`}</code>
          ))}
        </p>
      </div>

      <div className="space-y-6">
        {TEMPLATE_TYPES.map(({ type, label }) => (
          <div
            key={type}
            className="rounded-md border border-border p-5 space-y-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                subject:{" "}
                <span className="font-mono">{DEFAULT_SUBJECTS[type]}</span>
              </p>
            </div>
            <TemplateEditor
              type={type}
              defaultBody={savedMap[type] ?? DEFAULT_BODIES[type] ?? ""}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
