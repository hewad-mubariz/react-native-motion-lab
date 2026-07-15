import React, { createContext, useCallback, useContext, useState } from 'react';
import { runOnJS, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

export const LIGHT = {
  background: '#ffffff',
  card: 'rgba(255,255,255,0.98)',
  cardBorder: 'rgba(0,0,0,0.09)',
  text: 'rgba(8,10,16,0.92)',
  textSub: 'rgba(8,10,16,0.45)',
  kicker: 'rgba(0,0,0,0.38)',
  icon: 'rgba(8,10,16,0.92)',
  iconChevron: 'rgba(8,10,16,0.35)',
  shadowColor: '#000',
};

export const DARK = {
  background: '#0e0f14',
  card: 'rgba(26,28,38,0.98)',
  cardBorder: 'rgba(255,255,255,0.07)',
  text: 'rgba(228,230,242,0.92)',
  textSub: 'rgba(228,230,242,0.45)',
  kicker: 'rgba(228,230,242,0.38)',
  icon: 'rgba(228,230,242,0.9)',
  iconChevron: 'rgba(228,230,242,0.28)',
  shadowColor: '#000',
};

export type ThemeColors = typeof LIGHT;

type ThemeCtx = {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: (x: number, y: number) => void;
  overlayRadius: SharedValue<number>;
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  overlayBg: string;
  isTransitioning: boolean;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [overlayBg, setOverlayBg] = useState(LIGHT.background);

  const overlayRadius = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const onEnd = useCallback(() => {
    overlayRadius.value = 0;
    setIsTransitioning(false);
  }, [overlayRadius]);

  const toggleTheme = useCallback(
    (x: number, y: number) => {
      if (isTransitioning) return;

      setOverlayBg(isDark ? DARK.background : LIGHT.background);
      originX.value = x;
      originY.value = y;
      overlayRadius.value = 0;

      setIsDark((d) => !d);
      setIsTransitioning(true);

      overlayRadius.value = withTiming(
        1600,
        { duration: 680, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onEnd)();
        },
      );
    },
    [isTransitioning, isDark, overlayRadius, originX, originY, onEnd],
  );

  return (
    <Ctx.Provider
      value={{
        isDark,
        colors: isDark ? DARK : LIGHT,
        toggleTheme,
        overlayRadius,
        originX,
        originY,
        overlayBg,
        isTransitioning,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
