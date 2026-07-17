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
import {
  ArrowDown,
  ArrowUp,
  Globe,
  Mail,
  Plus,
  Store,
  Trash2,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
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
  BIO_BLOCK_TYPES,
  BIO_BLOCK_META,
  MAX_HEADLINE,
  MAX_TEXT,
  MAX_LINK_LABEL,
  MAX_SOCIALS,
  canAddBlock,
  type BioBlock,
  type BioBlockType,
  type BioPageSettings,
  type BioSocial,
  type BioSocialPlatform,
} from "@inklee/shared/bio-page";
import type { MobileMe } from "@inklee/shared/mobile-api";
import { BIO_SOCIAL_ICON_PATH } from "@inklee/shared/bio-social-icons";

// Native Link Hub editor — mirrors the web /link-hub form: a fixed social icon
// row plus an ORDERED, mixed list of blocks (headlines, texts, links) the artist
// arranges, up to 10 of each. Saved via POST /api/mobile/settings/hub. The model
// + validation + caps + labels come from @inklee/shared/bio-page (one source of
// truth); this screen owns only the React Native presentation. Booking policy +
// shop are booking-page concerns and live in booking settings, not here.

// Brand glyphs render from the shared 24x24 path map (one source of truth with
// the web Hub) via react-native-svg, so the app and web draw the same mark.
// website / email and any platform without a brand path (e.g. fourthwall) fall
// back to the SAME lucide glyphs the web uses (Globe / Mail / Store). Display
// LABELS come from BIO_SOCIAL_META.
function SocialGlyph({
  platform,
  color,
  size = 18,
}: {
  platform: BioSocialPlatform;
  color: string;
  size?: number;
}) {
  const path = BIO_SOCIAL_ICON_PATH[platform];
  if (path) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={path} fill={color} />
      </Svg>
    );
  }
  const Fallback =
    platform === "email" ? Mail : platform === "website" ? Globe : Store;
  return <Fallback size={size} color={color} />;
}

// Partial<BioBlock> over a discriminated union narrows to only the common keys
// (id, type), so patches use an explicit field-union of every block's fields.
type BlockPatch = Partial<{
  text: string;
  label: string;
  url: string;
  isActive: boolean;
}>;

function makeBlock(type: BioBlockType): BioBlock {
  // Any non-empty id works: the server keeps it, else derives a stable fallback.
  const id = `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  if (type === "link") return { id, type: "link", label: "", url: "", isActive: true };
  if (type === "headline") return { id, type: "headline", text: "" };
  return { id, type: "text", text: "" };
}

// The parser drops empty headline/text and links with an unsafe/invalid URL, and
// caps each type at 10; we re-sync state from the saved result, so an entry can
// vanish. Surface what was skipped so it doesn't disappear with only "Saved.".
function buildSavedNote(droppedBlocks: number, droppedSocials: number): string {
  const parts: string[] = [];
  if (droppedBlocks > 0) {
    parts.push(`${droppedBlocks} item${droppedBlocks === 1 ? "" : "s"}`);
  }
  if (droppedSocials > 0) {
    parts.push(`${droppedSocials} social${droppedSocials === 1 ? "" : "s"}`);
  }
  return parts.length
    ? `Saved. ${parts.join(" and ")} skipped (empty, invalid, or past the limit of 10).`
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

function HubForm({
  initial,
  slug,
}: {
  initial: BioPageSettings;
  slug: string | null;
}) {
  const queryClient = useQueryClient();
  const colors = useColors();

  const [blocks, setBlocks] = useState<BioBlock[]>(initial.blocks);
  const [socials, setSocials] = useState<BioSocial[]>(initial.socials);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const dirty = () => {
    setError(null);
    setNote(null);
  };

  const patchBlock = (id: string, patch: BlockPatch) => {
    dirty();
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as BioBlock) : b)),
    );
  };
  const removeBlock = (id: string) => {
    dirty();
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const moveBlock = (index: number, dir: -1 | 1) => {
    dirty();
    setBlocks((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const addBlock = (type: BioBlockType) => {
    dirty();
    setBlocks((prev) =>
      canAddBlock(prev, type) ? [...prev, makeBlock(type)] : prev,
    );
  };

  const updateSocialUrl = (index: number, url: string) => {
    dirty();
    setSocials((prev) => prev.map((s, i) => (i === index ? { ...s, url } : s)));
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

    const sentBlockCount = blocks.length;
    const sentSocialCount = socials.length;

    try {
      // The Link Hub editor owns only blocks + socials. The server merges these
      // onto the current bio_page (preserving bookingPolicy + module visibility)
      // and returns the sanitized result; reset local state to it so dropped /
      // capped / normalized values reflect.
      const saved = await apiPost<BioPageSettings>("/settings/hub", {
        blocks,
        socials,
      });
      setBlocks(saved.blocks);
      setSocials(saved.socials);
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/hub"],
      });
      setNote(
        buildSavedNote(
          sentBlockCount - saved.blocks.length,
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
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        <Text className="text-sm text-shell-dim">
          A standalone link-in-bio page for your socials, headlines, text, and
          links. It never replaces your booking page.
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

        {/* Socials — fixed icon row, shown above the blocks on the public page. */}
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
                  <SocialGlyph
                    platform={s.platform}
                    color={colors.accent}
                    size={18}
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
                keyboardType={s.platform === "email" ? "email-address" : "url"}
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
                    <SocialGlyph platform={p} color={colors.accent} size={16} />
                    <Text className="text-sm text-foreground">
                      {BIO_SOCIAL_META[p].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Content blocks — one ordered, mixed list the artist arranges. */}
        <SectionLabel>Content</SectionLabel>
        <Card>
          <Text className="text-sm text-shell-dim">
            Add headlines, text, and links, then reorder with the arrows. Up to
            10 of each. This is the body of your Link Hub.
          </Text>

          <View className="mt-4">
            {blocks.length === 0 ? (
              <Text className="text-sm text-shell-dim">No content yet.</Text>
            ) : null}
            {blocks.map((block, i) => (
              <View
                key={block.id}
                className="mb-3 rounded-xl border-brand border-shell-border p-3"
              >
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-shell-mute">
                    {BIO_BLOCK_META[block.type].label}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <IconButton
                      icon={ArrowUp}
                      label="Move up"
                      outlined
                      iconSize={16}
                      disabled={i === 0}
                      onPress={() => moveBlock(i, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="Move down"
                      outlined
                      iconSize={16}
                      disabled={i === blocks.length - 1}
                      onPress={() => moveBlock(i, 1)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Remove"
                      outlined
                      iconSize={16}
                      onPress={() => removeBlock(block.id)}
                    />
                  </View>
                </View>

                {block.type === "headline" ? (
                  <TextField
                    value={block.text}
                    onChangeText={(v) =>
                      patchBlock(block.id, { text: v.slice(0, MAX_HEADLINE) })
                    }
                    placeholder="e.g. Fine-line tattoos in Berlin"
                    accessibilityLabel="Headline"
                  />
                ) : null}

                {block.type === "text" ? (
                  <TextArea
                    value={block.text}
                    onChangeText={(v) => patchBlock(block.id, { text: v })}
                    maxLength={MAX_TEXT}
                    showCounter
                    minHeight={100}
                    placeholder="e.g. Booking a few custom pieces this season."
                    accessibilityLabel="Text"
                  />
                ) : null}

                {block.type === "link" ? (
                  <>
                    <TextField
                      value={block.label}
                      onChangeText={(v) =>
                        patchBlock(block.id, {
                          label: v.slice(0, MAX_LINK_LABEL),
                        })
                      }
                      placeholder="Label (e.g. Portfolio)"
                      accessibilityLabel="Link label"
                    />
                    <TextField
                      value={block.url}
                      onChangeText={(v) => patchBlock(block.id, { url: v })}
                      placeholder="https://… or you@email.com"
                      keyboardType="url"
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="Link URL"
                    />
                    <View className="flex-row items-center gap-2">
                      <Switch
                        value={block.isActive}
                        onValueChange={(v) =>
                          patchBlock(block.id, { isActive: v })
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
                  </>
                ) : null}
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap gap-2">
            {BIO_BLOCK_TYPES.map((type) => (
              <Button
                key={type}
                label={BIO_BLOCK_META[type].addLabel}
                variant="secondary"
                size="sm"
                icon={Plus}
                disabled={!canAddBlock(blocks, type)}
                onPress={() => addBlock(type)}
              />
            ))}
          </View>
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
