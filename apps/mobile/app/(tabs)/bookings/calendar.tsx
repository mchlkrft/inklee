import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { DayAgenda } from "@/components/calendar/DayAgenda";
import { useCalendarMonth } from "@/lib/calendar";
import { colors } from "@/lib/tokens";
import { useScrollHide } from "@/lib/scroll-hide";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { useScreenView } from "@/lib/analytics";

// Month grid of confirmed appointments + the selected day's agenda. Tapping an
// appointment opens the shared booking detail screen. Trips, flash, slots and
// appointment-create are web-only for now (the mobile calendar endpoint is
// approved-bookings-only) — see E5 follow-ups.
export default function CalendarScreen() {
  useScreenView("calendar");
  const cal = useCalendarMonth();
  const router = useRouter();
  const onScroll = useScrollHide();

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={cal.refreshing}
            onRefresh={cal.refresh}
            tintColor={colors.mustard}
          />
        }
      >
        <View className="pb-3">
          <Button
            label="New appointment"
            size="sm"
            onPress={() =>
              router.push(`/bookings/new?date=${cal.selectedDate}`)
            }
          />
        </View>
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
