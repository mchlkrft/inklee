import { Text, View } from "react-native";
import {
  Ban,
  Bell,
  Check,
  CheckCircle2,
  Circle,
  Inbox,
  Mail,
  Pencil,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import type { BookingActivityKind } from "@inklee/shared/booking-activity";
import type { MobileBookingTimelineEvent } from "@/lib/bookings";
import { formatShortDateTime } from "@/lib/date";
import { useColors } from "@/lib/theme";

// The booking's activity feed (web CommunicationSidebar parity): labels come
// fully resolved from the API via the shared describe helper; this component
// only maps each kind to an icon + tone. Rows render flat (icon chip + label
// over timestamp) rather than the web's solid pills — mobile rows sit directly
// on the themed surface.
const KIND_ICONS: Record<BookingActivityKind, LucideIcon> = {
  submitted: Inbox,
  client_edited: Pencil,
  client_cancelled: Ban,
  deposit_paid: CheckCircle2,
  reminder: Bell,
  accepted: Check,
  passed: X,
  deposit_requested: Mail,
  cancelled: Ban,
  status_other: Circle,
};

function useKindColor(): (kind: BookingActivityKind) => string {
  const themed = useColors();
  return (kind) => {
    switch (kind) {
      case "accepted":
      case "deposit_paid":
        return themed.successFg;
      case "passed":
      case "client_cancelled":
        return themed.dangerFg;
      case "reminder":
      case "deposit_requested":
        return themed.accent;
      default:
        return themed.shell.dim;
    }
  };
}

export function ActivityTimeline({
  events,
}: {
  events: MobileBookingTimelineEvent[];
}) {
  const colorFor = useKindColor();
  return (
    <View className="gap-2.5">
      {events.map((e, i) => {
        const Icon = KIND_ICONS[e.kind] ?? Circle;
        return (
          <View
            key={`${e.action}-${e.at}-${i}`}
            className="flex-row items-center gap-3"
          >
            <View className="h-7 w-7 items-center justify-center rounded-full bg-shell-hover">
              <Icon size={14} strokeWidth={2.5} color={colorFor(e.kind)} />
            </View>
            <View className="flex-1">
              <Text className="text-base text-foreground">{e.label}</Text>
              <Text className="text-sm text-shell-mute">
                {formatShortDateTime(e.at)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
