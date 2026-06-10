import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { DayAgenda } from "@/components/calendar/DayAgenda";
import { useCalendarMonth } from "@/lib/calendar";
import { colors } from "@/lib/tokens";
import { useScreenView } from "@/lib/analytics";

// Month grid of confirmed appointments + the selected day's agenda. Tapping an
// appointment opens the shared booking detail screen. Trips, flash, slots and
// appointment-create are web-only for now (the mobile calendar endpoint is
// approved-bookings-only) — see E5 follow-ups.
export default function CalendarScreen() {
  useScreenView("calendar");
  const cal = useCalendarMonth();

  return (
    <Screen edges={["left", "right"]}>
      <Text className="py-2 text-2xl font-bold text-bone">Calendar</Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={cal.refreshing}
            onRefresh={cal.refresh}
            tintColor={colors.mustard}
          />
        }
      >
        <MonthGrid
          monthLabel={cal.monthLabel}
          weeks={cal.weeks}
          selectedDate={cal.selectedDate}
          onSelectDay={cal.selectDay}
          onPrev={cal.goPrevMonth}
          onNext={cal.goNextMonth}
        />

        <View className="mt-5">
          {cal.error ? (
            <EmptyState title="Couldn't load calendar" subtitle={cal.error} />
          ) : cal.loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.mustard} />
            </View>
          ) : (
            <DayAgenda
              dateKey={cal.selectedDate}
              appointments={cal.selectedAppointments}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
