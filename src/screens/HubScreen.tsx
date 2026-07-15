import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

export const HubScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const toggleRef = useRef<View>(null);

  const padTop = insets.top + 28;
  const padBottom = insets.bottom + 28;

  const handleToggle = () => {
    toggleRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
      toggleTheme(pageX + w / 2, pageY + h / 2);
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: padTop, paddingBottom: padBottom, backgroundColor: colors.background }]}>
      {/* Dark mode toggle */}
      <View ref={toggleRef} style={[styles.toggleWrap, { top: insets.top + 14, borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        <Pressable
          onPress={handleToggle}
          hitSlop={12}
          style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          accessibilityRole="button"
        >
          <Ionicons
            name={isDark ? 'sunny' : 'moon'}
            size={20}
            color={colors.icon}
          />
        </Pressable>
      </View>

      <Text style={[styles.kicker, { color: colors.kicker }]}>Birds</Text>
      <Text style={[styles.title, { color: colors.text }]}>Choose a scene</Text>

      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Murmuration flock scene"
          onPress={() => router.push("/birds")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <MaterialCommunityIcons name="bird" size={36} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Murmuration</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Interactive flock</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open art gallery corridor"
          onPress={() => router.push("/gallery")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons name="images-outline" size={34} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Art gallery</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Walk the gallery</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open card flip scene"
          onPress={() => router.push("/card-flip")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons name="card-outline" size={34} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Card flip</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Glass shimmer card</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open pixel explosion scene"
          onPress={() => router.push("/pixel-explosion")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons name="sparkles" size={34} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Pixel explosion</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Tiger reform effect</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open furniture showcase"
          onPress={() => router.push("/furniture-showcase")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons name="color-palette-outline" size={34} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Furniture showcase</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Interactive product viewer</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open bar chart scene"
          onPress={() => router.push("/bar-chart")}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, shadowColor: colors.shadowColor },
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons name="bar-chart-outline" size={34} color={colors.icon} />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Bar chart</Text>
            <Text style={[styles.cardHint, { color: colors.textSub }]}>Voxel city morph</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.iconChevron} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
  },
  toggleWrap: {
    position: 'absolute',
    right: 22,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
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
    borderWidth: StyleSheet.hairlineWidth,
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
    letterSpacing: -0.2,
  },
  cardHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },
});
