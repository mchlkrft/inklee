// GENERATED FILE - exported from the Control Tower Email hub. Re-exporting overwrites it;
// edit in the hub and re-export, or take ownership by removing the export there first.
// Activation is deliberate: flip status to "active" here, in a reviewed commit. The engine
// also stays inert until EMAIL_LIFECYCLE_ENABLED is set.
import type { LifecycleDefinition } from "../types";

export const definition: LifecycleDefinition = {
  key: "books_open_live",
  name: "Books-open activated",
  status: "active",
  audienceKey: "books_open_recent",
  throttleDays: 7,
  preferenceCategory: "lifecycle",
  subject: "Books-open mode is live",
  html: '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Hi {{artist_name}},</p>\n<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;">Your books are open. To get the most out of it:</p>\n<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.7;color:#374151;"><li>Post a story saying books are open, with your booking link.</li><li>Check the link sits first in your Instagram bio.</li><li>Close books again once you have enough requests; your page updates itself. Easy peasy.</li></ul><div style="margin-top:20px;"><a href="{{public_page_link}}" style="display:inline-block;margin:10px 0 6px;background:#e9b22b;color:#1e1e1e;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:9999px;">Share booking link</a><br/><span style="font-size:12px;color:#9ca3af;">Or paste this link into your browser:</span><br/><a href="{{public_page_link}}" style="font-size:12px;color:#6b7280;word-break:break-all;">{{public_page_link}}</a></div>',
  text: "Hi {{artist_name}},\n\nYour books are open. To get the most out of it:\n\n- Post a story saying books are open, with your booking link.\n- Check the link sits first in your Instagram bio.\n- Close books again once you have enough requests; your page updates itself. Easy peasy.\n\nShare booking link: {{public_page_link}}",
};
