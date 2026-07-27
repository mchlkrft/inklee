import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Info } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import {
  STUDIO_DATA_CREDIT,
  DATA_ATTRIBUTION_LINK_LABEL,
} from "@inklee/shared/map-attribution";

import { AdaptiveSheet } from "@/components/AdaptiveSheet";
import { config } from "@/lib/config";
import { useColors } from "@/lib/theme";

/**
 * Map attribution for the native maps (parity gap found 2026-07-27: the app
 * rendered the same basemap tiles and the same seeded studio rows as web with
 * no credit of any kind).
 *
 * The obligations attach to the Produced Work, not to whether its audience is
 * public, so an artists-only app does not escape them: ODbL 1.0 (OSM), CDLA-
 * Permissive-2.0 (Overture) and Apache-2.0 (Foursquare rows) all ride on these
 * pins. Every string comes from `@inklee/shared/map-attribution`, never
 * restated here, so the counsel-approved wording cannot drift from web.
 *
 * Collapsed by default behind a labelled "i", matching the web pill (founder
 * direction 2026-07-27, counsel-approved). Native has room that a map canvas
 * does not, so opening it shows the credits in full rather than truncated.
 *
 * It lives in the TOP control row rather than web's bottom-right corner: on
 * these screens every bottom overlay (in-view count, city panel, pin preview)
 * is anchored to one baseline and grows upward, so a bottom-corner control
 * would be covered the moment a pin is tapped. Top-right is also where the
 * platform maps put theirs.
 */
export default function MapAttribution() {
  const [open, setOpen] = useState(false);
  const colors = useColors();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Map attribution"
        className="h-11 w-11 items-center justify-center rounded-full border border-shell-border bg-chrome active:opacity-70"
      >
        <Info size={16} color={colors.bone} />
      </Pressable>

      <AdaptiveSheet visible={open} onClose={() => setOpen(false)}>
        <Text className="text-base font-semibold text-foreground">
          Map data
        </Text>

        <Text className="mt-3 text-xs leading-5 text-shell-mute">
          Basemap by{" "}
          <Text
            className="text-foreground underline"
            onPress={() => Linking.openURL("https://maplibre.org/")}
          >
            MapLibre
          </Text>{" "}
          and{" "}
          <Text
            className="text-foreground underline"
            onPress={() => Linking.openURL("https://carto.com/attributions")}
          >
            CARTO
          </Text>
          , with tiles from{" "}
          <Text
            className="text-foreground underline"
            onPress={() =>
              Linking.openURL("https://www.openstreetmap.org/copyright")
            }
          >
            OpenStreetMap contributors
          </Text>
          .
        </Text>

        {/* Counsel-approved wording, rendered verbatim. Do not edit or
            paraphrase it here; change the shared constant with a counsel note
            or not at all. */}
        <Text className="mt-3 text-xs leading-5 text-shell-mute">
          {STUDIO_DATA_CREDIT}
        </Text>

        <Pressable
          onPress={() => {
            void WebBrowser.openBrowserAsync(config.dataAttributionUrl()).catch(
              () => {},
            );
          }}
          accessibilityRole="button"
          className="mt-4 h-11 items-center justify-center rounded-full border border-shell-border active:opacity-70"
        >
          <Text className="text-sm font-medium text-foreground">
            {DATA_ATTRIBUTION_LINK_LABEL}
          </Text>
        </Pressable>
      </AdaptiveSheet>
    </>
  );
}
