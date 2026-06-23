import { Stack } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

const stackAnimations =
  Platform.OS === "android"
    ? ("slide_from_right" as const)
    : ("default" as const);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.chrome}>
      <SafeAreaProvider>
        <View style={styles.chrome}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: stackAnimations,
              gestureEnabled: true,
              gestureDirection: "horizontal",
              fullScreenGestureEnabled: true,
              contentStyle: styles.stackContent,
              animationTypeForReplace: "push",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="birds" />
            <Stack.Screen name="card-flip" />
            <Stack.Screen name="gallery" />
            <Stack.Screen name="pixel-explosion" />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  chrome: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  stackContent: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
