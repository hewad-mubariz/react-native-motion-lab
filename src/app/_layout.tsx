import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

const stackAnimations =
  Platform.OS === "android"
    ? ("slide_from_right" as const)
    : ("default" as const);

function AppShell() {
  return (
    <View style={styles.chrome}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: stackAnimations,
          gestureEnabled: true,
          gestureDirection: "horizontal",
          fullScreenGestureEnabled: true,
          contentStyle: { flex: 1, backgroundColor: "transparent" },
          animationTypeForReplace: "push",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="birds" />
        <Stack.Screen name="card-flip" />
        <Stack.Screen name="gallery" />
        <Stack.Screen name="salon-selection" />
        <Stack.Screen name="stadium-selection" />
        <Stack.Screen name="pixel-explosion" />
        <Stack.Screen name="furniture-showcase" />
        <Stack.Screen name="bar-chart" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ShareTechMono: require("../../assets/fonts/ShareTechMono-Regular.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.chrome}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  chrome: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
