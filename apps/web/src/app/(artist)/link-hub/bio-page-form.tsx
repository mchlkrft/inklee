"use client";

import { useActionState, useState } from "react";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { saveBioPageAction } from "./actions";
import {
  MAX_LINKS,
  MAX_HEADLINE,
  MAX_TEXT,
  MAX_LINK_LABEL,
  MAX_SOCIALS,
  BIO_SOCIAL_PLATFORMS,
  BIO_SOCIAL_META,
  type BioCustomLink,
  type BioSocial,
  type BioSocialPlatform,
  type BioPageSettings,
} from "@/lib/bio-page-settings";

type State = { error: string } | { success: true; note?: string } | null;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const ICON_BTN =
  "rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";

function makeLink(): BioCustomLink {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `link-${Date.now()}`;
  return { id, label: "", url: "", isActive: true };
}

// The Link Hub editor owns the standalone link-in-bio page: a headline, a short
// description, the social icon row, and the link buttons. Booking policy + shop
// are booking-page concerns and live in /bookings/settings, not here. The save
// action preserves those fields so editing the Hub never touches them.
export default function BioPageForm({ bioPage }: { bioPage: BioPageSettings }) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBioPageAction,
    null,
  );

  const [headline, setHeadline] = useState(bioPage.headline ?? "");
  const [text, setText] = useState(bioPage.text ?? "");
  const [links, setLinks] = useState<BioCustomLink[]>(bioPage.customLinks);
  const [socials, setSocials] = useState<BioSocial[]>(bioPage.socials);

  const updateLink = (id: string, patch: Partial<BioCustomLink>) =>
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLink = (id: string) =>
    setLinks((prev) => prev.filter((l) => l.id !== id));
  const move = (index: number, dir: -1 | 1) =>
    setLinks((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const addLink = () =>
    setLinks((prev) =>
      prev.length >= MAX_LINKS ? prev : [...prev, makeLink()],
    );

  const updateSocial = (index: number, patch: Partial<BioSocial>) =>
    setSocials((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  const removeSocial = (index: number) =>
    setSocials((prev) => prev.filter((_, i) => i !== index));
  const addSocial = () =>
    setSocials((prev) => {
      if (prev.length >= MAX_SOCIALS) return prev;
      const used = new Set(prev.map((s) => s.platform));
      const next =
        BIO_SOCIAL_PLATFORMS.find((p) => !used.has(p)) ??
        BIO_SOCIAL_PLATFORMS[0];
      return [...prev, { platform: next, url: "" }];
    });

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="custom_links" value={JSON.stringify(links)} />
      <input type="hidden" name="socials" value={JSON.stringify(socials)} />

      {/* Headline */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Headline</h2>
          <p className="text-sm text-muted-foreground">
            A short tagline shown under your name on your Link Hub.
          </p>
        </div>
        <input
          name="hub_headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value.slice(0, MAX_HEADLINE))}
          placeholder="e.g. Fine-line tattoos in Berlin"
          className={INPUT}
        />
        <p className="text-right text-xs text-muted-foreground">
          {headline.length}/{MAX_HEADLINE}
        </p>
      </section>

      {/* Text */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Text</h2>
          <p className="text-sm text-muted-foreground">
            A short description for your Link Hub. Falls back to your profile
            bio when left empty.
          </p>
        </div>
        <textarea
          name="hub_text"
          rows={4}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Booking a few custom pieces this season. Tap a link below or book a tattoo."
          className={`${INPUT} resize-none`}
        />
        <p className="text-right text-xs text-muted-foreground">
          {text.length}/{MAX_TEXT}
        </p>
      </section>

      {/* Links */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Links</h2>
          <p className="text-sm text-muted-foreground">
            Aftercare, portfolio, shop, anything. Shown as buttons on your Link
            Hub.
          </p>
        </div>

        <div className="space-y-2">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          )}
          {links.map((link, i) => (
            <div
              key={link.id}
              className="space-y-2 rounded-md border border-border px-3 py-3"
            >
              <div className="flex gap-2">
                <input
                  value={link.label}
                  onChange={(e) =>
                    updateLink(link.id, {
                      label: e.target.value.slice(0, MAX_LINK_LABEL),
                    })
                  }
                  placeholder="Label (e.g. Instagram)"
                  className={INPUT}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move link up"
                    className={ICON_BTN}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === links.length - 1}
                    aria-label="Move link down"
                    className={ICON_BTN}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLink(link.id)}
                    aria-label="Remove link"
                    className={ICON_BTN}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              <input
                value={link.url}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                placeholder="https://… or you@email.com"
                inputMode="url"
                className={INPUT}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={link.isActive}
                  onChange={(e) =>
                    updateLink(link.id, { isActive: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
          ))}
        </div>

        {links.length < MAX_LINKS && (
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add link
          </button>
        )}
      </section>

      {/* Socials */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Socials</h2>
          <p className="text-sm text-muted-foreground">
            Your social profiles, shown as an icon row at the top of your Link
            Hub.
          </p>
        </div>

        <div className="space-y-2">
          {socials.length === 0 && (
            <p className="text-sm text-muted-foreground">No socials yet.</p>
          )}
          {socials.map((s, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={s.platform}
                onChange={(e) =>
                  updateSocial(i, {
                    platform: e.target.value as BioSocialPlatform,
                  })
                }
                aria-label="Platform"
                className={`${INPUT} max-w-[9.5rem] shrink-0`}
              >
                {BIO_SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {BIO_SOCIAL_META[p].label}
                  </option>
                ))}
              </select>
              <input
                value={s.url}
                onChange={(e) => updateSocial(i, { url: e.target.value })}
                placeholder={
                  s.platform === "email" ? "you@email.com" : "https://…"
                }
                inputMode="url"
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => removeSocial(i)}
                aria-label="Remove social"
                className={ICON_BTN}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        {socials.length < MAX_SOCIALS && (
          <button
            type="button"
            onClick={addSocial}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add social
          </button>
        )}
      </section>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">
          {state.note ?? "Saved."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Link Hub"}
      </button>
    </form>
  );
}
