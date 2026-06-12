import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

// Native time picker -> 24h "HH:mm" string (the wire format the slot pattern
// uses; the server interprets it in the artist's profile timezone). Sibling of
// DateField: Android opens the one-shot dialog imperatively; iOS shows an
// inline spinner with a Done button.
function timeToDate(value: string | null): Date {
  const m = value ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  const d = new Date();
  d.setHours(m ? Number(m[1]) : 12, m ? Number(m[2]) : 0, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeField({
  label,
  value,
  onChange,
  placeholder = "Select a time",
}: {
  label?: string;
  value: string | null;
  onChange: (time: string) => void;
  placeholder?: string;
}) {
  const [showIos, setShowIos] = useState(false);
  const current = timeToDate(value);

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "time",
        is24Hour: true,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === "set" && d) onChange(dateToTime(d));
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
          {value ?? placeholder}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && showIos ? (
        <View className="mt-2 rounded-xl border border-shell-border">
          <DateTimePicker
            value={current}
            mode="time"
            display="spinner"
            is24Hour
            onChange={(_e, d?: Date) => {
              if (d) onChange(dateToTime(d));
            }}
          />
          <Pressable
            onPress={() => {
              // The spinner only fires onChange when the wheels move; Done on
              // an untouched spinner commits the value it displays (the 12:00
              // default) instead of silently leaving the field empty.
              if (!value) onChange(dateToTime(current));
              setShowIos(false);
            }}
            className="items-end px-4 py-2 active:opacity-70"
          >
            <Text className="font-medium text-accent">Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
