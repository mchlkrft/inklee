"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DATE_FLEXIBILITIES,
  DATE_FLEXIBILITY_LABELS,
  GS_EQUIPMENT_MAX,
  GS_EXPECTED_CLIENTS_MAX,
  GS_INTRO_MAX,
  GS_SOCIAL_LINK_MAX,
  type DateFlexibility,
} from "@inklee/shared/guest-spots";
import { submitGuestSpotRequestAction } from "../../../travel/requests/actions";

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export default function RequestForm({
  studioProfileId,
}: {
  studioProfileId: string;
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [flexibility, setFlexibility] = useState<DateFlexibility>("exact");
  const [socialLink, setSocialLink] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [expectedClients, setExpectedClients] = useState("");
  const [equipmentNeeds, setEquipmentNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitGuestSpotRequestAction(studioProfileId, {
        startDate,
        endDate: endDate || startDate,
        dateFlexibility: flexibility,
        socialLink,
        introduction,
        expectedClients: expectedClients || null,
        equipmentNeeds: equipmentNeeds || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/travel/requests/${result.requestId}`);
    });
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-foreground">From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={INPUT_CLS}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-foreground">To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={INPUT_CLS}
          />
          <span className="text-xs text-muted-foreground">
            Leave empty for a single day.
          </span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-foreground">
          How fixed are these dates?
        </legend>
        <div className="flex flex-wrap gap-2">
          {DATE_FLEXIBILITIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFlexibility(f)}
              aria-pressed={flexibility === f}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                flexibility === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground hover:bg-muted/30"
              }`}
            >
              {DATE_FLEXIBILITY_LABELS[f]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="text-foreground">
          Your Instagram or portfolio link
        </span>
        <input
          type="url"
          value={socialLink}
          onChange={(e) => setSocialLink(e.target.value)}
          maxLength={GS_SOCIAL_LINK_MAX}
          placeholder="https://instagram.com/yourname"
          className={INPUT_CLS}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-foreground">Introduce yourself</span>
        <textarea
          value={introduction}
          onChange={(e) => setIntroduction(e.target.value)}
          maxLength={GS_INTRO_MAX}
          rows={5}
          placeholder="Who you are, what you tattoo, why this studio."
          className={INPUT_CLS}
        />
        <span className="text-xs text-muted-foreground">
          {introduction.length}/{GS_INTRO_MAX}
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-foreground">
          Expected clients{" "}
          <span className="text-muted-foreground">(optional)</span>
        </span>
        <input
          type="text"
          value={expectedClients}
          onChange={(e) => setExpectedClients(e.target.value)}
          maxLength={GS_EXPECTED_CLIENTS_MAX}
          placeholder="Bringing my own bookings, expecting 5 to 8 clients."
          className={INPUT_CLS}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-foreground">
          Equipment needs{" "}
          <span className="text-muted-foreground">(optional)</span>
        </span>
        <input
          type="text"
          value={equipmentNeeds}
          onChange={(e) => setEquipmentNeeds(e.target.value)}
          maxLength={GS_EQUIPMENT_MAX}
          placeholder="I bring my own machines, need an arm rest."
          className={INPUT_CLS}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        {error ? <p className="text-xs text-brand-red">{error}</p> : null}
      </div>
    </div>
  );
}
