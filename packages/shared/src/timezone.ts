// Convert a local date + time string to an ISO UTC string for a given timezone
export function localToUTC(
  date: string,
  time: string,
  timezone: string,
): string {
  // Approximate UTC from local time
  const approxUTC = new Date(`${date}T${time}:00Z`);

  // Get what local time this UTC maps to in the target timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(approxUTC);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  const localAsUTC = new Date(
    `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:00Z`,
  );

  // Offset = approxUTC - localAsUTC (how far off we were)
  const offset = approxUTC.getTime() - localAsUTC.getTime();
  return new Date(approxUTC.getTime() + offset).toISOString();
}

export function formatSlotDisplay(
  startsAt: string,
  durationMinutes: number,
  timezone: string,
): {
  date: string;
  time: string;
  tz: string;
} {
  const d = new Date(startsAt);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    date: formatter.format(d),
    time: `${timeFormatter.format(d)} (${durationMinutes} min)`,
    tz: timezone,
  };
}

export function generateSubSlots(
  date: string,
  startTime: string,
  endTime: string,
  durationMinutes: number,
  timezone: string,
): { startsAt: string; endsAt: string; durationMinutes: number }[] {
  const slots: { startsAt: string; endsAt: string; durationMinutes: number }[] =
    [];

  const startUTC = new Date(localToUTC(date, startTime, timezone));
  const endUTC = new Date(localToUTC(date, endTime, timezone));
  const durationMs = durationMinutes * 60 * 1000;

  let cursor = startUTC.getTime();
  while (cursor + durationMs <= endUTC.getTime()) {
    slots.push({
      startsAt: new Date(cursor).toISOString(),
      endsAt: new Date(cursor + durationMs).toISOString(),
      durationMinutes,
    });
    cursor += durationMs;
  }

  return slots;
}

// Curated timezone choices for the artist profile settings. The web form's
// <select> and the mobile picker share this list so the two platforms cannot
// drift. Arbitrary IANA values set through other paths (e.g. the mobile
// "use device timezone" shortcut) remain valid; this is only the browse list.
export const CURATED_TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;
