import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const HubScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const padTop = insets.top + 28;
  const padBottom = insets.bottom + 28;

  return (
    <View style={[styles.screen, { paddingTop: padTop, paddingBottom: padBottom }]}>
      <Text style={styles.kicker}>Birds</Text>
      <Text style={styles.title}>Choose a scene</Text>

      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Murmuration flock scene"
          onPress={() => router.push("/birds")}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <MaterialCommunityIcons
            name="bird"
            size={36}
            color="rgba(8, 10, 16, 0.92)"
          />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Murmuration</Text>
            <Text style={styles.cardHint}>Interactive flock</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(8,10,16,0.35)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open art gallery corridor"
          onPress={() => router.push("/gallery")}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <Ionicons
            name="images-outline"
            size={34}
            color="rgba(8, 10, 16, 0.92)"
          />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Art gallery</Text>
            <Text style={styles.cardHint}>Walk the gallery</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(8,10,16,0.35)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open card flip scene"
          onPress={() => router.push("/card-flip")}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <Ionicons
            name="card-outline"
            size={34}
            color="rgba(8, 10, 16, 0.92)"
          />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Card flip</Text>
            <Text style={styles.cardHint}>Glass shimmer card</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(8,10,16,0.35)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open pixel explosion scene"
          onPress={() => router.push("/pixel-explosion")}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <Ionicons
            name="sparkles"
            size={34}
            color="rgba(8, 10, 16, 0.92)"
          />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Pixel explosion</Text>
            <Text style={styles.cardHint}>Tiger reform effect</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(8,10,16,0.35)" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open furniture showcase"
          onPress={() => router.push("/furniture-showcase")}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <Ionicons
            name="color-palette-outline"
            size={34}
            color="rgba(8, 10, 16, 0.92)"
          />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Furniture showcase</Text>
            <Text style={styles.cardHint}>Interactive product viewer</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(8,10,16,0.35)" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(0, 0, 0, 0.38)",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "rgba(8, 10, 16, 0.92)",
    marginBottom: 28,
    letterSpacing: -0.3,
  },
  links: {
    gap: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.09)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "rgba(8, 10, 16, 0.92)",
    letterSpacing: -0.2,
  },
  cardHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(8, 10, 16, 0.45)",
  },
});
