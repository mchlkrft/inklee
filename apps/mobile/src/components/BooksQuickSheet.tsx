import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Settings as SettingsIcon, X } from "lucide-react-native";
import { IconButton } from "./IconButton";
import { TopSheet } from "./TopSheet";
import { apiPost, invalidateBooksViews, useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { palettes } from "@/lib/theme";
import { border, colors } from "@/lib/tokens";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Quick open/close control behind the top-bar books pill — the founder's
// "tap the pill, flip the books" round-4 ask. TopSheet owns the slide/fade
// mechanics; this owns the toggle. The Switch drives the RAW books_open flag
// via POST /settings/books with an optimistic /me cache patch; the status line
// shows the EFFECTIVE state, and an expired booking window gets an
// explanatory note so the pill never silently disagrees with the switch.
export function BooksQuickSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQ = useApiQuery<MobileMe>("/me");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear a stale failure note whenever the sheet (re)opens.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const me = meQ.data;

  function patchMe(nextFlag: boolean) {
    queryClient.setQueryData<MobileMe>(["api", "/me"], (old) =>
      old
        ? {
            ...old,
            booksOpenFlag: nextFlag,
            booksOpen: nextFlag && !old.bookingWindowExpired,
          }
        : old,
    );
  }

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    // Cancel any in-flight /me refetch (e.g. from a rapid previous toggle's
    // invalidation) so a stale response can't clobber the optimistic patch.
    await queryClient.cancelQueries({ queryKey: ["api", "/me"] });
    patchMe(next);
    try {
      await apiPost("/settings/books", { open: next });
      // Reconcile with the server's effective state (window expiry etc.).
      void invalidateBooksViews(queryClient);
    } catch (e) {
      captureError(e, { op: "toggleBooksQuickSheet" });
      patchMe(!next); // clean single revert
      setError("Couldn't update. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!me) return null;

  const effectiveOpen = me.booksOpen;
  // ?? booksOpen: a stale deployed API has no booksOpenFlag yet; its booksOpen
  // IS the raw flag, so the Switch stays truthful during the deploy window.
  const flagOn = me.booksOpenFlag ?? me.booksOpen;
  const windowBlocked = !!me.bookingWindowExpired && flagOn;

  return (
    <TopSheet open={open} onClose={onClose} closeLabel="Close booking status">
      {/* Header: status headline + the X where the pill row sits. */}
      <View
        className="flex-row items-center gap-3 pb-4"
        style={{
          borderBottomWidth: border.hairline,
          borderColor: colors.shell.border,
        }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            backgroundColor: effectiveOpen ? colors.mustard : colors.shell.mute,
          }}
        />
        <Text className="flex-1 text-subtitle font-semibold text-bone">
          {effectiveOpen ? "Books open" : "Books closed"}
        </Text>
        <IconButton
          icon={X}
          label="Close"
          onPress={onClose}
          outlined
          borderColor={colors.shell.border}
          color={colors.bone}
        />
      </View>

      <View className="flex-row items-center justify-between pt-4">
        <View className="flex-1 pr-3">
          <Text className="text-body font-medium text-bone">
            Accept new requests
          </Text>
          {/* Static shell color: this panel is fixed-dark chrome, so the
              themed text-shell-dim class would go near-invisible in the
              light theme. */}
          <Text className="mt-0.5 text-sm" style={{ color: colors.shell.dim }}>
            {windowBlocked
              ? "Requests open once your booking window allows it."
              : flagOn
                ? "Clients can send booking requests."
                : "Your page shows a closed notice."}
          </Text>
        </View>
        <Switch
          value={flagOn}
          onValueChange={toggle}
          disabled={pending}
          accessibilityLabel="Accept new requests"
          trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
          thumbColor={colors.bone}
          ios_backgroundColor="rgba(0,0,0,0.35)"
        />
      </View>

      {windowBlocked ? (
        <Text className="mt-2 text-xs" style={{ color: colors.shell.dim }}>
          Your booking window has ended, so your page still shows closed.
          Adjust the window in booking settings.
        </Text>
      ) : null}
      {error ? (
        // Fixed-dark panel: pin the dark-readable danger in both themes
        // (the themed var would flip to the light value here).
        <Text className="mt-2 text-xs" style={{ color: palettes.dark.dangerFg }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose();
          router.push("/settings/books");
        }}
        className="mt-3 flex-row items-center gap-3 py-3 active:opacity-60"
      >
        <SettingsIcon size={20} color={colors.shell.dim} />
        <Text className="flex-1 text-body text-bone">Booking settings</Text>
        <ChevronRight size={16} color={colors.shell.mute} />
      </Pressable>
    </TopSheet>
  );
}
