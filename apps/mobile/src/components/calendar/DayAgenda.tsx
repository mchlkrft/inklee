import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MapPin, Zap } from "lucide-react-native";
import { Card } from "@/components/Card";
import { TravelIcon } from "@/components/TravelIcon";
import type {
  CalendarAppointment,
  MobileCalendarFlashDay,
  MobileGuestSpot,
} from "@/lib/calendar";
import { formatDayLabel } from "@/lib/date";
import { useColors } from "@/lib/theme";

// The selected day's agenda beneath the month grid: guest spots first, then
// appointments, then flash days (the web popover's order). Appointment cards
// push the booking detail; guest-spot and flash rows tap through to their
// editors — a deliberate mobile divergence from the web's non-tappable bands
// (no hover detail on a phone).
export function DayAgenda({
  dateKey,
  appointments,
  guestSpots = [],
  flashDays = [],
}: {
  dateKey: string;
  appointments: CalendarAppointment[];
  guestSpots?: MobileGuestSpot[];
  flashDays?: MobileCalendarFlashDay[];
}) {
  const router = useRouter();
  const themed = useColors();
  const empty =
    appointments.length === 0 && guestSpots.length === 0 && flashDays.length === 0;

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">
        {formatDayLabel(dateKey)}
      </Text>

      {empty ? (
        <Text className="text-sm text-shell-dim">
          No appointments this day.
        </Text>
      ) : (
        <>
          {guestSpots.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() => router.push(`/travel/trips/${g.tripId}`)}
              className="flex-row items-center gap-2 rounded-2xl border border-shell-border bg-glass px-4 py-3 active:opacity-80"
            >
              {/* The trip's library icon when chosen; MapPin otherwise. */}
              <TravelIcon
                icon={g.icon ?? null}
                fallback={MapPin}
                size={16}
                color={g.iconColor ?? themed.cobalt}
              />
              <Text
                className="flex-1 text-base font-medium text-foreground"
                numberOfLines={1}
              >
                {g.studioName ?? g.tripTitle}
              </Text>
              <Text className="text-sm text-shell-dim">Guest spot</Text>
            </Pressable>
          ))}

          {appointments.map((a) => (
            <Card key={a.id} onPress={() => router.push(`/bookings/${a.id}`)}>
              <Text className="text-base font-semibold text-foreground">
                {a.client}
              </Text>
              {a.placement ? (
                <Text className="mt-0.5 text-sm text-shell-dim">
                  {a.placement}
                </Text>
              ) : null}
            </Card>
          ))}

          {flashDays.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/flash/days/${f.id}`)}
              className="flex-row items-center gap-2 rounded-2xl border border-shell-border bg-glass px-4 py-3 active:opacity-80"
            >
              <Zap size={16} color={themed.successFg} />
              <Text
                className="flex-1 text-base font-medium text-foreground"
                numberOfLines={1}
              >
                {f.title}
              </Text>
              <Text className="text-sm text-shell-dim">Flash day</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
