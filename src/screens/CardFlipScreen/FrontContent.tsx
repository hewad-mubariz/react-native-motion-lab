import { EmbossedText } from "@/components/EmbossedText";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SharedValue } from "react-native-reanimated";
import { ChipView } from "./ChipView";
import { CARD_BRAND, CARD_NUMBER_MASKED, CARD_NUMBER_FONT_FAMILY } from "./constants";
import { styles } from "./styles";
import { useParallax } from "./useParallax";

export interface FrontContentProps {
  isNumberFontReady: boolean;
  lightX: SharedValue<number>;
  lightY: SharedValue<number>;
}

export function FrontContent({ isNumberFontReady, lightX, lightY }: FrontContentProps) {
  const topParallax    = useParallax(lightX, lightY, 0.25);
  const chipParallax   = useParallax(lightX, lightY, 0.65);
  const numberParallax = useParallax(lightX, lightY, 0.80);
  const botParallax    = useParallax(lightX, lightY, 0.45);

  return (
    <View style={styles.cardUI} pointerEvents="none">
      <Animated.View style={topParallax}>
        <View style={styles.cardTop}>
          <Text style={styles.bankName}>{CARD_BRAND}</Text>
          <View style={styles.topRight}>
            <Text style={styles.debit}>debit</Text>
            <MaterialCommunityIcons
              name="contactless-payment"
              size={28}
              color="rgba(205,232,255,0.70)"
            />
          </View>
        </View>
      </Animated.View>

      <Animated.View style={chipParallax}>
        <ChipView />
      </Animated.View>

      <Animated.View style={numberParallax}>
        <Text style={[styles.cardNumberText, isNumberFontReady && styles.cardNumberFont]}>
          {CARD_NUMBER_MASKED}
        </Text>
      </Animated.View>

      <Animated.View style={botParallax}>
        <View style={styles.cardBot}>
          <View>
            <EmbossedText
              text="ALEX KOWALSKI"
              fontSize={14}
              charAdvance={10.2}
              spaceAdvance={13}
              width={200}
              height={28}
              baseline={18}
            />
            <Text style={styles.expiry}>09 / 28</Text>
          </View>
          <View style={styles.mastercard}>
            <View style={styles.network}>
              <View style={[styles.netCircle, { backgroundColor: "#eb001b", marginRight: -10 }]} />
              <View style={[styles.netCircle, { backgroundColor: "#f79e1b" }]} />
            </View>
            <Text style={styles.mastercardText}>mastercard</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
