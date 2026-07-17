import { useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { IconButton } from "@/components/IconButton";
import { colors } from "@/lib/tokens";
import type { MobileBookingImage } from "@inklee/shared/mobile-api";

// Reference images on the booking detail (founder round 4: attachments were a
// "viewable on the web" text stub). A 3-per-row thumbnail grid; tapping opens
// a full-screen swipeable lightbox with the client's annotation markers
// overlaid at their normalized positions and the comments listed beneath —
// the native take on the web AnnotatedImageGallery. Markers need the stored
// image dimensions to size the overlay box; when a row predates the
// width/height columns we show the comments without markers.
export function ReferenceImageGallery({
  images,
}: {
  images: MobileBookingImage[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {images.map((img, i) => {
          const count = img.annotations?.length ?? 0;
          return (
            <Pressable
              key={img.url}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Reference image ${i + 1} of ${images.length}${
                count > 0 ? `, ${count} note${count === 1 ? "" : "s"}` : ""
              }`}
              onPress={() => setOpenIndex(i)}
              className="active:opacity-80"
              style={{ width: "31%" }}
            >
              <Image
                source={{ uri: img.url }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: 12 }}
                contentFit="cover"
                transition={120}
              />
              {count > 0 ? (
                <View
                  className="absolute right-1.5 top-1.5 min-w-[20px] items-center justify-center rounded-full bg-mustard px-1.5"
                  style={{ height: 20 }}
                >
                  <Text
                    className="text-[11px] font-bold text-charcoal"
                    style={{ lineHeight: 13, includeFontPadding: false }}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {openIndex !== null ? (
        <Lightbox
          images={images}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: MobileBookingImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  // Stable callback object — FlatList warns if this prop changes identity.
  const onViewable = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: { index: number | null }[];
    }) => {
      const first = viewableItems[0]?.index;
      if (typeof first === "number") setIndex(first);
    },
  );

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
    >
      <View className="flex-1 bg-black">
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(img) => img.url}
          initialScrollIndex={initialIndex}
          // Required with initialScrollIndex, or Android silently ignores it.
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onViewableItemsChanged={onViewable.current}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item }) => <LightboxPage image={item} width={width} />}
        />

        {/* Chrome floats over the pager: close X top-right, counter bottom. */}
        <View
          className="absolute left-0 right-0 flex-row items-center justify-end px-4"
          style={{ top: 56 }}
        >
          <IconButton
            icon={X}
            label="Close"
            onPress={onClose}
            outlined
            borderColor="rgba(255,255,255,0.3)"
            color={colors.bone}
          />
        </View>
        {images.length > 1 ? (
          <View
            className="absolute left-0 right-0 items-center"
            style={{ bottom: 32 }}
          >
            <Text className="text-sm text-bone">
              {index + 1} of {images.length}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function LightboxPage({
  image,
  width,
}: {
  image: MobileBookingImage;
  width: number;
}) {
  const annotations = image.annotations ?? [];
  // Markers are normalized to the IMAGE box; an aspectRatio-sized container
  // makes the overlay box equal the rendered image box. Without stored
  // dimensions we can't place markers reliably — comments still list below.
  const hasDims = !!image.width && !!image.height;
  const aspect = hasDims ? image.width! / image.height! : undefined;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingVertical: 96,
      }}
      showsVerticalScrollIndicator={false}
    >
      {hasDims ? (
        <View style={{ width, aspectRatio: aspect }}>
          <Image
            source={{ uri: image.url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
          />
          {annotations.map((a, i) => (
            <View
              key={a.id}
              pointerEvents="none"
              className="absolute items-center justify-center rounded-full bg-mustard"
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                width: 22,
                height: 22,
                marginLeft: -11,
                marginTop: -11,
              }}
            >
              <Text
                className="text-[12px] font-bold text-charcoal"
                style={{ lineHeight: 14, includeFontPadding: false }}
              >
                {i + 1}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Image
          source={{ uri: image.url }}
          style={{ width, height: width }}
          contentFit="contain"
        />
      )}

      {annotations.length > 0 ? (
        <View className="mt-4 gap-2 px-5">
          {annotations.map((a, i) => (
            <View key={a.id} className="flex-row gap-2">
              <Text className="text-sm font-bold text-mustard">{i + 1}</Text>
              <Text className="flex-1 text-sm text-bone">{a.comment}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
