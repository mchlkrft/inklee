/** Faux iPhone-shaped preview for the /download hero.
 *
 *  We don't have the real mobile app yet (Phase E), so this is a
 *  brand-flavoured representation: phone chrome built in CSS, stacked
 *  content cards using the same tokens the real app shell uses. Same
 *  pattern as the onboarding intro-slide visuals (FU-13).
 *
 *  Pure presentation. No client behaviour. Lazy-rendered by the parent
 *  page; safe to drop into a Server Component.
 */

import { Bell, Calendar, Plane, Inbox } from "lucide-react";
import Spiderweb from "@/components/icons/spiderweb";

export default function DevicePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] md:max-w-[320px]">
      {/* Phone outer frame */}
      <div className="relative aspect-[9/19] rounded-[44px] border-[10px] border-brand-charcoal bg-brand-charcoal p-1 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]">
        {/* Screen */}
        <div
          className="relative h-full w-full overflow-hidden rounded-[34px]"
          style={{ background: "#e5e1d5" }}
        >
          {/* Notch */}
          <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-brand-charcoal" />

          {/* Status row */}
          <div className="flex items-center justify-between px-5 pb-2 pt-4 text-[10px] font-semibold text-brand-charcoal">
            <span>9:41</span>
            <span className="opacity-60">●●●●●</span>
          </div>

          {/* App header */}
          <div className="flex items-center justify-between px-5 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <Spiderweb className="h-4 w-4 text-brand-charcoal" />
              <span className="text-xs font-bold uppercase tracking-wider text-brand-charcoal">
                Inklee
              </span>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-brand-charcoal/20 bg-white/40">
              <Bell className="h-3.5 w-3.5 text-brand-charcoal" />
            </div>
          </div>

          {/* Greeting */}
          <div className="px-5 pt-1">
            <p className="text-[10px] uppercase tracking-widest text-brand-charcoal/60">
              Friday
            </p>
            <p className="text-lg font-black leading-tight text-brand-charcoal">
              Morning, Bert.
            </p>
          </div>

          {/* Card stack */}
          <div className="space-y-2 px-3 pt-4">
            {/* New requests card — rosa accent */}
            <div className="overflow-hidden rounded-2xl border-[1.5px] border-brand-charcoal/12 bg-white/55">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-rosa text-brand-charcoal">
                  <Inbox className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-brand-charcoal/60">
                    New requests
                  </p>
                  <p className="truncate text-sm font-bold text-brand-charcoal">
                    3 waiting on you
                  </p>
                </div>
                <span className="rounded-full bg-brand-charcoal px-2 py-0.5 text-[10px] font-bold text-brand-bone">
                  3
                </span>
              </div>
            </div>

            {/* Trip card — mustard accent */}
            <div className="overflow-hidden rounded-2xl border-[1.5px] border-brand-charcoal/12 bg-brand-mustard/22">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-mustard text-brand-charcoal">
                  <Plane className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-brand-charcoal/60">
                    Next trip
                  </p>
                  <p className="truncate text-sm font-bold text-brand-charcoal">
                    Berlin · Aug 12 – 16
                  </p>
                </div>
              </div>
            </div>

            {/* Today card — neutral */}
            <div className="overflow-hidden rounded-2xl border-[1.5px] border-brand-charcoal/12 bg-white/45">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-charcoal text-brand-bone">
                  <Calendar className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-brand-charcoal/60">
                    Today
                  </p>
                  <p className="truncate text-sm font-bold text-brand-charcoal">
                    2 sessions booked
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom nav suggestion */}
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-full bg-brand-charcoal px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-brand-bone/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-bone" />
            <span className="h-2 w-2 rounded-full bg-brand-bone/40" />
            <span className="h-2 w-2 rounded-full bg-brand-bone/40" />
          </div>
        </div>
      </div>

      {/* Floating "Coming soon" pill */}
      <div className="absolute -right-2 top-10 rotate-6 rounded-full border-[1.5px] border-brand-charcoal bg-brand-mustard px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-charcoal shadow-card md:-right-4">
        Coming soon
      </div>
    </div>
  );
}
