// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "no_requests_day_7",
  name: "Booking page live, no requests, day 7",
  status: "draft",
  audienceKey: "no_requests_day_7",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "A few ways to get your first Inklee request",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Your booking page is live but no requests have come in yet. A few practical things that usually help:</p>\n<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.7;color:#374151;"><li>Put your booking link first in your Instagram / TikTok bio.</li><li>Add a clear booking line to the bio, so the next step is obvious.</li><li>Post one story explaining how to book, and save it as a highlight.</li><li>Keep the request form focused on what you need to judge a project.</li></ul><div style="margin-top:20px;"><a href="{{public_page_link}}" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Review booking page</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="{{public_page_link}}" style="font-size:12px;color:#6b7280;word-break:break-all;">{{public_page_link}}</a></div>',
  text: "Hi {{artist_name}},\n\nYour booking page is live but no requests have come in yet. A few practical things that usually help:\n\n- Put your booking link first in your Instagram / TikTok bio.\n- Add a clear booking line to the bio, so the next step is obvious.\n- Post one story explaining how to book, and save it as a highlight.\n- Keep the request form focused on what you need to judge a project.\n\nReview booking page: {{public_page_link}}",
};
