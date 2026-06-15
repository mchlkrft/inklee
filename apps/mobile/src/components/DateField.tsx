import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { localDateKey } from "@inklee/shared/date-utils";
import { formatShortDate } from "@/lib/date";

// Native date picker -> YYYY-MM-DD date-key. Android opens the one-shot dialog
// imperatively; iOS shows an inline calendar with a Done button. Better than a
// raw text field: the native picker enforces minimumDate and can't be mistyped.
function keyToDate(key: string | null, fallback: Date): Date {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : fallback;
}

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label?: string;
  value: string | null;
  onChange: (dateKey: string) => void;
  minimumDate?: Date;
}) {
  const [showIos, setShowIos] = useState(false);
  const current = keyToDate(value, minimumDate ?? new Date());

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        minimumDate,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === "set" && d) onChange(localDateKey(d));
        },
      });
    } else {
      setShowIos(true);
    }
  };

  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-foreground">
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={open}
        className="h-12 justify-center rounded-xl border-brand border-shell-border px-4 active:opacity-80"
      >
        <Text
          className={`text-base ${value ? "text-foreground" : "text-shell-mute"}`}
        >
          {value ? formatShortDate(value) : "Select a date"}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && showIos ? (
        <View className="mt-2 rounded-xl border border-shell-border">
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            onChange={(_e, d?: Date) => {
              if (d) onChange(localDateKey(d));
            }}
          />
          <Pressable
            onPress={() => setShowIos(false)}
            className="items-end px-4 py-2 active:opacity-70"
          >
            <Text className="font-medium text-accent">Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
