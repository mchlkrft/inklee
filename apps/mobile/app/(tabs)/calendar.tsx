import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";

// Calendar lands in slice E5 (slots + availability). Tab present now so the
// 5-tab shell is real from the first build.
export default function CalendarScreen() {
  return (
    <Screen>
      <Text className="py-2 text-2xl font-bold text-bone">Calendar</Text>
      <EmptyState
        title="Coming soon"
        subtitle="Your availability and booked sessions will live here."
      />
    </Screen>
  );
}
