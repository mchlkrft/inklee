import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { TextArea } from "@/components/TextArea";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { config, displayUrl } from "@/lib/config";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import {
  BIO_SOCIAL_META,
  BIO_SOCIAL_PLATFORMS,
  MAX_BOOKING_POLICY,
  MAX_LINKS,
  MAX_LINK_LABEL,
  MAX_SOCIALS,
  type BioCustomLink,
  type BioPageSettings,
  type BioSocial,
  type BioSocialPlatform,
} from "@inklee/shared/bio-page";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Native Link Hub editor — mirrors the web /link-hub form (links, socials,
// booking policy, shop visibility), saved via POST /api/mobile/settings/hub. The
// model + validation + labels all come from @inklee/shared/bio-page (one source
// of truth); this screen only owns the React Native presentation. The booking
// page is untouched — the Hub is the standalone /<slug>/hub surface.

// lucide-react-native has NO brand logos, so social glyphs use Ionicons `logo-*`
// (verified present in the Ionicons glyphmap); website/email fall back to a
// generic glyph. Display LABELS come from the shared BIO_SOCIAL_META.
const SOCIAL_ICON: Record<BioSocialPlatform, keyof typeof Ionicons.glyphMap> = {
  instagram: "logo-instagram",
  tiktok: "logo-tiktok",
  x: "logo-x",
  facebook: "logo-facebook",
  youtube: "logo-youtube",
  threads: "logo-threads",
  pinterest: "logo-pinterest",
  website: "globe-outline",
  email: "mail-outline",
};

function makeLink(): BioCustomLink {
  // Any non-empty id works: the server keeps it, else derives a stable fallback.
  return {
    id: `link-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    label: "",
    url: "",
    isActive: true,
  };
}

// The parser silently drops links/socials with an unsafe or invalid URL, and we
// re-sync state from the saved result, so an entry can vanish. Surface what was
// skipped (the web form only reports links; reporting socials too avoids silent
// data loss when an email/social URL is invalid).
function buildSavedNote(droppedLinks: number, droppedSocials: number): string {
  const parts: string[] = [];
  if (droppedLinks > 0) {
    parts.push(`${droppedLinks} link${droppedLinks === 1 ? "" : "s"}`);
  }
  if (droppedSocials > 0) {
    parts.push(`${droppedSocials} social${droppedSocials === 1 ? "" : "s"}`);
  }
  return parts.length
    ? `Saved. ${parts.join(" and ")} skipped (unsafe or invalid URL).`
    : "Saved.";
}

export default function LinkHubScreen() {
  useScreenView("settings_link_hub");
  const q = useApiQuery<BioPageSettings>("/settings/hub");
  const meQ = useApiQuery<MobileMe>("/me");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your Link Hub"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <HubForm initial={q.data} slug={meQ.data?.slug ?? null} />;
}

function ShowSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-shell-dim">Show on Link Hub</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
        thumbColor={colors.bone}
        ios_backgroundColor="rgba(0,0,0,0.35)"
      />
    </View>
  );
}

function HubForm({
  initial,
  slug,
}: {
  initial: BioPageSettings;
  slug: string | null;
}) {
  const queryClient = useQueryClient();
  const colors = useColors();

  const [bookingPolicy, setBookingPolicy] = useState(
    initial.bookingPolicy ?? "",
  );
  const [links, setLinks] = useState<BioCustomLink[]>(initial.customLinks);
  const [socials, setSocials] = useState<BioSocial[]>(initial.socials);
  const [showLinks, setShowLinks] = useState(!initial.hidden.includes("links"));
  const [showPolicy, setShowPolicy] = useState(
    !initial.hidden.includes("policy"),
  );
  const [showShop, setShowShop] = useState(!initial.hidden.includes("shop"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const dirty = () => {
    setError(null);
    setNote(null);
  };

  const updateLink = (id: string, patch: Partial<BioCustomLink>) => {
    dirty();
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const removeLink = (id: string) => {
    dirty();
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };
  const moveLink = (index: number, dir: -1 | 1) => {
    dirty();
    setLinks((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const addLink = () => {
    dirty();
    setLinks((prev) => (prev.length >= MAX_LINKS ? prev : [...prev, makeLink()]));
  };

  const updateSocialUrl = (index: number, url: string) => {
    dirty();
    setSocials((prev) =>
      prev.map((s, i) => (i === index ? { ...s, url } : s)),
    );
  };
  const removeSocial = (index: number) => {
    dirty();
    setSocials((prev) => prev.filter((_, i) => i !== index));
  };
  const addSocial = (platform: BioSocialPlatform) => {
    dirty();
    setSocials((prev) =>
      prev.length >= MAX_SOCIALS ? prev : [...prev, { platform, url: "" }],
    );
  };

  const usedPlatforms = new Set(socials.map((s) => s.platform));
  const unusedPlatforms = BIO_SOCIAL_PLATFORMS.filter(
    (p) => !usedPlatforms.has(p),
  );
  const hubUrl = slug ? config.hubUrl(slug) : null;

  async function save() {
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    setNote(null);

    const hidden: BioPageSettings["hidden"] = [];
    if (!showLinks) hidden.push("links");
    if (!showPolicy) hidden.push("policy");
    if (!showShop) hidden.push("shop");

    const sentLinkCount = links.length;
    const sentSocialCount = socials.length;

    try {
      // The server round-trips this through parseBioPageSettings and returns the
      // sanitized result; reset local state to it so dropped/normalized values
      // are reflected (same round-trip the web form does).
      const saved = await apiPost<BioPageSettings>("/settings/hub", {
        bookingPolicy: bookingPolicy.trim() || null,
        customLinks: links,
        socials,
        hidden,
      });
      setBookingPolicy(saved.bookingPolicy ?? "");
      setLinks(saved.customLinks);
      setSocials(saved.socials);
      setShowLinks(!saved.hidden.includes("links"));
      setShowPolicy(!saved.hidden.includes("policy"));
      setShowShop(!saved.hidden.includes("shop"));
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/hub"],
      });

      setNote(
        buildSavedNote(
          sentLinkCount - saved.customLinks.length,
          sentSocialCount - saved.socials.length,
        ),
      );
    } catch (e) {
      captureError(e, { op: "saveLinkHub" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        <Text className="text-sm text-shell-dim">
          A standalone link-in-bio page for your socials, links, and booking
          policy. It never replaces your booking page.
        </Text>
        {hubUrl ? (
          <Pressable
            onPress={() => {
              void Linking.openURL(hubUrl).catch(() => {});
            }}
            accessibilityRole="link"
            accessibilityLabel="Open your public Link Hub"
            className="mt-1.5 flex-row items-center gap-1.5 active:opacity-60"
          >
            <Ionicons name="open-outline" size={14} color={colors.accent} />
            <Text className="text-sm font-medium text-accent">
              {displayUrl(hubUrl)}
            </Text>
          </Pressable>
        ) : null}

        {/* Links */}
        <SectionLabel>Links</SectionLabel>
        <Card>
          <ShowSwitch value={showLinks} onValueChange={setShowLinks} />
          <Text className="mt-1 text-sm text-shell-dim">
            Aftercare, portfolio, shop, anything. Shown as buttons on your Link
            Hub.
          </Text>

          <View className="mt-4">
            {links.length === 0 ? (
              <Text className="text-sm text-shell-dim">No links yet.</Text>
            ) : null}
            {links.map((link, i) => (
              <View
                key={link.id}
                className="mb-3 rounded-xl border-brand border-shell-border p-3"
              >
                <TextField
                  value={link.label}
                  onChangeText={(v) =>
                    updateLink(link.id, { label: v.slice(0, MAX_LINK_LABEL) })
                  }
                  placeholder="Label (e.g. Instagram)"
                  accessibilityLabel="Link label"
                />
                <TextField
                  value={link.url}
                  onChangeText={(v) => updateLink(link.id, { url: v })}
                  placeholder="https://… or you@email.com"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Link URL"
                />
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Switch
                      value={link.isActive}
                      onValueChange={(v) =>
                        updateLink(link.id, { isActive: v })
                      }
                      trackColor={{
                        false: "rgba(0,0,0,0.35)",
                        true: colors.mustard,
                      }}
                      thumbColor={colors.bone}
                      ios_backgroundColor="rgba(0,0,0,0.35)"
                    />
                    <Text className="text-sm text-shell-dim">Active</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <IconButton
                      icon={ArrowUp}
                      label="Move link up"
                      outlined
                      iconSize={16}
                      disabled={i === 0}
                      onPress={() => moveLink(i, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="Move link down"
                      outlined
                      iconSize={16}
                      disabled={i === links.length - 1}
                      onPress={() => moveLink(i, 1)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Remove link"
                      outlined
                      iconSize={16}
                      onPress={() => removeLink(link.id)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {links.length < MAX_LINKS ? (
            <Button
              label="Add link"
              variant="secondary"
              size="sm"
              icon={Plus}
              onPress={addLink}
            />
          ) : null}
        </Card>

        {/* Socials */}
        <SectionLabel>Socials</SectionLabel>
        <Card>
          <Text className="mb-3 text-sm text-shell-dim">
            Your social profiles, shown as an icon row at the top of your Link
            Hub.
          </Text>

          {socials.length === 0 ? (
            <Text className="text-sm text-shell-dim">No socials yet.</Text>
          ) : null}
          {socials.map((s, i) => (
            <View key={s.platform} className="mb-3">
              <View className="mb-1.5 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={SOCIAL_ICON[s.platform]}
                    size={18}
                    color={colors.accent}
                  />
                  <Text className="text-sm font-medium text-foreground">
                    {BIO_SOCIAL_META[s.platform].label}
                  </Text>
                </View>
                <IconButton
                  icon={Trash2}
                  label={`Remove ${BIO_SOCIAL_META[s.platform].label}`}
                  outlined
                  iconSize={16}
                  onPress={() => removeSocial(i)}
                />
              </View>
              <TextField
                value={s.url}
                onChangeText={(v) => updateSocialUrl(i, v)}
                placeholder={
                  s.platform === "email" ? "you@email.com" : "https://…"
                }
                keyboardType={
                  s.platform === "email" ? "email-address" : "url"
                }
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={`${BIO_SOCIAL_META[s.platform].label} URL`}
              />
            </View>
          ))}

          {unusedPlatforms.length > 0 ? (
            <View className="mt-1">
              <Text className="mb-2 text-sm text-shell-dim">Add a social</Text>
              <View className="flex-row flex-wrap gap-2">
                {unusedPlatforms.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => addSocial(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${BIO_SOCIAL_META[p].label}`}
                    className="flex-row items-center gap-1.5 rounded-full border-brand border-shell-border px-3 py-2 active:opacity-70"
                  >
                    <Ionicons
                      name={SOCIAL_ICON[p]}
                      size={16}
                      color={colors.accent}
                    />
                    <Text className="text-sm text-foreground">
                      {BIO_SOCIAL_META[p].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Booking policy */}
        <SectionLabel>Booking policy</SectionLabel>
        <Card>
          <ShowSwitch value={showPolicy} onValueChange={setShowPolicy} />
          <Text className="mb-3 mt-1 text-sm text-shell-dim">
            Deposit, cancellation, minimum size, the work you take on. Shown on
            your public page.
          </Text>
          <TextArea
            value={bookingPolicy}
            onChangeText={(v) => {
              dirty();
              setBookingPolicy(v);
            }}
            maxLength={MAX_BOOKING_POLICY}
            showCounter
            minHeight={120}
            placeholder="e.g. A deposit holds your date. Deposits are non-refundable but carry to one reschedule with 48 hours notice."
            accessibilityLabel="Booking policy"
          />
        </Card>

        {/* Shop */}
        <SectionLabel>Shop</SectionLabel>
        <Card>
          <ShowSwitch value={showShop} onValueChange={setShowShop} />
          <Text className="mt-1 text-sm text-shell-dim">
            Your goods for appointment pickup. The Goods module ships next; this
            controls whether the shop section can show on your public page.
          </Text>
        </Card>

        {error ? (
          <Text className="mt-4 text-sm text-danger-fg">{error}</Text>
        ) : null}
        {note ? (
          <Text className="mt-4 text-sm text-success-fg">{note}</Text>
        ) : null}

        <View className="mt-5">
          <Button label="Save Link Hub" onPress={save} loading={saving} />
        </View>
      </ScrollView>
    </Screen>
  );
}
