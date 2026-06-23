import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { SharedValue } from "react-native-reanimated";
import { CARD_BRAND } from "./constants";
import { styles } from "./styles";
import { useParallax } from "./useParallax";

export interface BackContentProps {
  lightX: SharedValue<number>;
  lightY: SharedValue<number>;
}

export function BackContent({ lightX, lightY }: BackContentProps) {
  // All children are position:absolute, so wrap each in a full-size Animated.View
  // so the inner absolute coords stay correct relative to the card face.
  const sigParallax   = useParallax(lightX, lightY, 0.30, true);
  const brandParallax = useParallax(lightX, lightY, 0.50, true);
  const netParallax   = useParallax(lightX, lightY, 0.35, true);
  const printParallax = useParallax(lightX, lightY, 0.15, true);

  return (
    <>
      {/* mag stripe is flush with the card surface — no parallax */}
      <View style={styles.magStripe} />

      <Animated.View style={[StyleSheet.absoluteFill, sigParallax]} pointerEvents="none">
        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>AUTHORIZED SIGNATURE</Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureStrip}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.signatureLine, { top: 5 + i * 4 }]} />
              ))}
              <Text style={styles.signatureHint}>not valid unless signed</Text>
            </View>
            <View style={styles.cvvPanel}>
              <Text style={styles.cvvLabel}>CVV</Text>
              <Text style={styles.cvvNum}>924</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, brandParallax]} pointerEvents="none">
        <View style={styles.backBrand}>
          <View style={styles.backLogoMark}>
            <Text style={styles.backLogoText}>R</Text>
          </View>
          <Text style={styles.backBank}>{CARD_BRAND}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, printParallax]} pointerEvents="none">
        <Text style={styles.backFinePrint}>
          This card is issued by {CARD_BRAND} Bank. Use is subject to cardholder agreement.
        </Text>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, netParallax]} pointerEvents="none">
        <Text style={styles.backNet}>mastercard</Text>
      </Animated.View>
    </>
  );
}
