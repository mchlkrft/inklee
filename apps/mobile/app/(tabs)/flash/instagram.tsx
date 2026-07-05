import { useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Check } from "lucide-react-native";
import type {
  MobileInstagram,
  MobileInstagramPost,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { DangerButton } from "@/components/DangerButton";
import { BrandLoader } from "@/components/BrandLoader";
import { ErrorState } from "@/components/ErrorState";
import { apiPost, useApiQuery } from "@/lib/api";
import { openConnectHandoff } from "@/lib/web-handoff";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";

const GAP = 8;
const H_PAD = 40; // Screen's px-5 on both sides.

export default function InstagramScreen() {
  const q = useApiQuery<MobileInstagram>("/instagram");
  const colors = useColors();
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - H_PAD - GAP * 2) / 3);

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      // Opens the in-app browser: magic-link session -> /instagram/start ->
      // Instagram OAuth -> callback. On return (browser closed) re-read status.
      await openConnectHandoff("/instagram/start");
      await q.refresh();
    } catch (e) {
      captureError(e, { op: "instagramConnect" });
      setError("Couldn't start the Instagram connection. Try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function resync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/instagram/sync");
      await q.refresh();
    } catch (e) {
      captureError(e, { op: "instagramSync" });
      setError(e instanceof Error ? e.message : "Couldn't resync. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  function confirmDisconnect() {
    Alert.alert(
      "Disconnect Instagram?",
      "This removes the connection and your synced posts. Designs you already imported stay in your library.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setError(null);
            setNotice(null);
            try {
              await apiPost("/instagram/disconnect");
              setSelected(new Set());
              await q.refresh();
            } catch (e) {
              captureError(e, { op: "instagramDisconnect" });
              setError("Couldn't disconnect. Try again.");
            }
          },
        },
      ],
    );
  }

  function toggle(post: MobileInstagramPost) {
    if (post.alreadyLinked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(post.id)) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
  }

  async function importSelected() {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const { created } = await apiPost<{ created: number }>(
        "/instagram/import",
        { postIds: [...selected] },
      );
      setNotice(
        created === 1
          ? "Added 1 design as a draft. Edit it in Designs."
          : `Added ${created} designs as drafts. Edit them in Designs.`,
      );
      setSelected(new Set());
      await q.refresh();
    } catch (e) {
      captureError(e, { op: "instagramImport" });
      setError(e instanceof Error ? e.message : "Couldn't import. Try again.");
    } finally {
      setImporting(false);
    }
  }

  // ── Loading / hard error ──────────────────────────────────────────────────
  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <BrandLoader />
          ) : (
            <ErrorState
              title="Couldn't load Instagram"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const { configured, account, posts } = q.data;

  // ── Not configured ────────────────────────────────────────────────────────
  if (!configured) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center px-2">
          <InfoCard
            title="Instagram import isn't available yet"
            body="This will let you turn your Instagram posts into flash designs. Check back soon."
          />
        </View>
      </Screen>
    );
  }

  const statusHeader = (
    <View className="pt-3">
      {account ? (
        <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-instagram" size={20} color={colors.accent} />
            <Text className="text-base font-semibold text-foreground">
              @{account.username}
            </Text>
          </View>
          <Text className="mt-1 text-sm text-shell-dim">
            {account.lastSyncAt
              ? `Last synced ${new Date(account.lastSyncAt).toLocaleDateString()}`
              : "Not synced yet"}
          </Text>
          <View className="mt-3 flex-row gap-2">
            <View className="flex-1">
              <Button
                label="Resync"
                variant="secondary"
                size="sm"
                onPress={resync}
                loading={syncing}
              />
            </View>
            <View className="flex-1">
              <DangerButton
                label="Disconnect"
                onPress={confirmDisconnect}
                disabled={syncing || importing}
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
          <Text className="text-base font-semibold text-foreground">
            Import from Instagram
          </Text>
          <Text className="mt-1 text-sm text-shell-dim">
            Connect your Instagram to turn your posts into flash designs in a
            few taps.
          </Text>
          <View className="mt-3">
            <Button
              label="Connect Instagram"
              onPress={connect}
              loading={connecting}
            />
          </View>
          <Text className="mt-2 text-xs text-shell-mute">
            Public access is in review with Instagram. Approved testers can
            connect now.
          </Text>
        </View>
      )}

      {notice ? (
        <View className="mb-3 rounded-xl border border-shell-border bg-glass px-3 py-2">
          <Text className="text-sm text-success-fg">{notice}</Text>
        </View>
      ) : null}
      {error ? (
        <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
      ) : null}

      {account ? (
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-foreground">
            {posts.length > 0 ? "Your posts" : ""}
          </Text>
          {selected.size > 0 ? (
            <View style={{ minWidth: 120 }}>
              <Button
                label={`Import ${selected.size}`}
                size="sm"
                onPress={importSelected}
                loading={importing}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen edges={["left", "right"]}>
      <FlatList
        data={account ? posts : []}
        keyExtractor={(p) => p.id}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
        ListHeaderComponent={statusHeader}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          account ? (
            <Text className="py-6 text-center text-sm text-shell-dim">
              No posts synced yet. Tap Resync to pull your latest posts.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <PostTile
            post={item}
            size={tileSize}
            selected={selected.has(item.id)}
            onPress={() => toggle(item)}
            accent={colors.accent}
            mute={colors.shell.mute}
          />
        )}
      />
    </Screen>
  );
}

function PostTile({
  post,
  size,
  selected,
  onPress,
  accent,
  mute,
}: {
  post: MobileInstagramPost;
  size: number;
  selected: boolean;
  onPress: () => void;
  accent: string;
  mute: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: post.alreadyLinked }}
      accessibilityLabel={post.alreadyLinked ? "Already added" : "Select post"}
      onPress={onPress}
      className={`overflow-hidden rounded-xl border-2 ${
        selected ? "border-mustard" : "border-shell-border"
      } ${post.alreadyLinked ? "opacity-45" : ""}`}
      style={{ width: size, height: size }}
    >
      {post.previewUrl ? (
        <Image
          source={{ uri: post.previewUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-mustard/15">
          <Ionicons name="image-outline" size={22} color={mute} />
        </View>
      )}
      {post.alreadyLinked ? (
        <View className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5">
          <Text className="text-center text-[10px] font-medium text-white">
            Added
          </Text>
        </View>
      ) : selected ? (
        <View
          className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-mustard"
          pointerEvents="none"
        >
          <Check size={13} color="#1e1e1e" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <View className="rounded-2xl border border-shell-border bg-glass p-4">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-sm text-shell-dim">{body}</Text>
    </View>
  );
}
