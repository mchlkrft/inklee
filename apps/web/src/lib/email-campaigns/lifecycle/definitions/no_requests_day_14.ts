// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "no_requests_day_14",
  name: "Booking page live, no requests, day 14",
  status: "draft",
  audienceKey: "no_requests_day_14",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Try a clearer booking CTA",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">If people ask about appointments in DMs but do not use your booking link, the missing piece is often one clear line that tells them where to go. A few that work:</p>\n<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.7;color:#374151;"><li>Booking requests here.</li><li>Send tattoo requests through my booking link.</li><li>For appointments, use the link in my bio.</li></ul>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Pick one, put it in your bio and your story replies, and point it at your booking page.</p><div style="margin-top:20px;"><a href="{{public_page_link}}" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Open your booking page</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="{{public_page_link}}" style="font-size:12px;color:#6b7280;word-break:break-all;">{{public_page_link}}</a></div>',
  text: "Hi {{artist_name}},\n\nIf people ask about appointments in DMs but do not use your booking link, the missing piece is often one clear line that tells them where to go. A few that work:\n\n- Booking requests here.\n- Send tattoo requests through my booking link.\n- For appointments, use the link in my bio.\n\nPick one, put it in your bio and your story replies, and point it at your booking page.\n\nOpen your booking page: {{public_page_link}}",
};
