import { Canvas, Path, Skia, FillType } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

export function DarkModeOverlay() {
  const { isTransitioning, overlayRadius, originX, originY, overlayBg } = useTheme();
  const { width, height } = useWindowDimensions();

  // Even-odd path: full-screen rect with a growing circle cut out of it.
  // The rect fills with the OLD background; the circle is transparent, revealing
  // the new theme already rendered underneath.
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.setFillType(FillType.EvenOdd);
    p.addRect({ x: 0, y: 0, width, height });
    p.addCircle(originX.value, originY.value, overlayRadius.value);
    return p;
  });

  if (!isTransitioning) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={path} color={overlayBg} />
    </Canvas>
  );
}
