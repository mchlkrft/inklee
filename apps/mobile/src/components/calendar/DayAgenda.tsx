import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "@/components/Card";
import type { CalendarAppointment } from "@/lib/calendar";
import { formatDayLabel } from "@/lib/date";

// The selected day's appointments, listed beneath the month grid. Each row taps
// through to the shared booking detail screen (E2).
export function DayAgenda({
  dateKey,
  appointments,
}: {
  dateKey: string;
  appointments: CalendarAppointment[];
}) {
  const router = useRouter();

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">
        {formatDayLabel(dateKey)}
      </Text>

      {appointments.length === 0 ? (
        <Text className="text-sm text-shell-dim">
          No appointments this day.
        </Text>
      ) : (
        appointments.map((a) => (
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
        ))
      )}
    </View>
  );
}
