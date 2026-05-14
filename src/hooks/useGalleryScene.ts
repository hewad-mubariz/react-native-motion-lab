import { makeGalleryScene, type CameraState } from "@/scenes/gallery";
import { GALLERY_CONFIG } from "@/scenes/gallery/config";
import {
  cameraBasis,
  computePaintingFocusPose,
  galleryPainting,
  type GalleryPainting,
} from "@/scenes/gallery/geometry";
import { fetchArticArtworks, type ArticArtwork } from "@/services/artic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { useWebGPU } from "./useWebGPU";

/**
 * React-side wrapper around the art gallery scene.
 *
 * Gestures drive the camera through four refs the scene reads each frame:
 *   - targetCameraRef  : where the camera wants to be
 *   - currentCameraRef : where the camera actually is (scene-writes)
 *   - dragModeRef      : when true the scene snaps yaw/pitch to target
 *   - isWalkingRef     : when true the scene integrates corridor motion into
 *                        walkDist each frame and keeps target from falling
 *                        behind; walkDist always eases toward target (double
 *                        tap & painting focus share that ease).
 *
 * Public actions:
 *   - handleTap(x, y)
 *       * Painting hit -> cinematic walk + face it.
 *       * Empty hit    -> level out the view (yaw/pitch back to 0); does
 *                          NOT walk. Use long-press for walking.
 *   - handleDragStart / handleDragUpdate / handleDragEnd
 *       Yaw + pitch rotation. Drag-the-world convention.
 *   - handleWalkStart / handleWalkEnd
 *       Toggles the walking flag. Direction is decided per frame in the
 *       scene from the camera's current yaw.
 *
 *   - handleDoubleTap()
 *       Advances target walkDist smoothly (ease like painting tap-to-focus).
 */

interface PaintingHit {
  slot: number;
  painting: GalleryPainting;
}

export const useGalleryScene = () => {
  const layoutRef = useRef({ width: 1, height: 1 });
  const targetCameraRef = useRef<CameraState>({
    walkDist: 0,
    yaw: 0,
    pitch: 0,
  });
  const currentCameraRef = useRef<CameraState>({
    walkDist: 0,
    yaw: 0,
    pitch: 0,
  });
  const dragModeRef = useRef(false);
  const isWalkingRef = useRef(false);
  const targetFovYRef = useRef(GALLERY_CONFIG.camera.fovY);
  const currentFovYRef = useRef(GALLERY_CONFIG.camera.fovY);
  const dragStartRef = useRef({ yaw: 0, pitch: 0 });
  const [artworks, setArtworks] = useState<ArticArtwork[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(true);
  const [loadedArtworkTextures, setLoadedArtworkTextures] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setArtworksLoading(true);

      try {
        const nextArtworks = await fetchArticArtworks(
          Math.min(GALLERY_CONFIG.painting.slotCount, 80),
        );

        if (!cancelled) {
          setArtworks(nextArtworks);
        }
      } catch {
        // Keep the seeded fallback textures. Production UI stays quiet.
      } finally {
        if (!cancelled) {
          setArtworksLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleArtworkLoaded = useCallback((count: number) => {
    setLoadedArtworkTextures(count);
  }, []);

  const scene = useMemo(
    () =>
      makeGalleryScene(
        {
          targetCameraRef,
          currentCameraRef,
          targetFovYRef,
          currentFovYRef,
          dragModeRef,
          isWalkingRef,
        },
        {
          artworks,
          onArtworkLoaded: handleArtworkLoaded,
        },
      ),
    [artworks, handleArtworkLoaded],
  );

  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  /**
   * Build a world-space ray from a screen tap, using the camera's CURRENT
   * orientation (not the smoothing target). The user's pointer points at
   * what they see right now.
   *
   * Eye X must match the lateral lean applied in scene.ts, otherwise the
   * ray would start from a different position than what the user sees and
   * tap targeting would drift on rotated views.
   */
  const buildTapRay = useCallback((tapX: number, tapY: number) => {
    const { width, height } = layoutRef.current;
    const cam = GALLERY_CONFIG.camera;
    const { yaw, pitch, walkDist } = currentCameraRef.current;

    const ndcX = (tapX / width) * 2 - 1;
    const ndcY = 1 - (tapY / height) * 2;

    const aspect = width / height;
    const halfH = Math.tan(currentFovYRef.current * 0.5);
    const halfW = halfH * aspect;

    const { forward, right, up } = cameraBasis(yaw, pitch);

    const dx = ndcX * halfW;
    const dy = ndcY * halfH;

    const dirX = right[0] * dx + up[0] * dy + forward[0];
    const dirY = right[1] * dx + up[1] * dy + forward[1];
    const dirZ = right[2] * dx + up[2] * dy + forward[2];

    return {
      eyeX: -Math.sin(yaw) * cam.lateralLean,
      eyeY: cam.eyeY,
      eyeZ: -walkDist,
      dirX,
      dirY,
      dirZ,
      walkDist,
    };
  }, []);

  /**
   * Test the ray against every painting slot. Returns the nearest hit, or null.
   * O(slotCount) per tap.
   */
  const intersectPaintings = useCallback(
    (ray: ReturnType<typeof buildTapRay>): PaintingHit | null => {
      const { frameThickness, slotCount } = GALLERY_CONFIG.painting;
      const { eyeX, eyeY, eyeZ, dirX, dirY, dirZ, walkDist } = ray;

      if (Math.abs(dirX) < 1e-4) return null;

      let nearestS = Infinity;
      let nearestHit: PaintingHit | null = null;

      for (let i = 0; i < slotCount; i++) {
        const gp = galleryPainting(i, walkDist);
        if (!gp.visible) continue;
        const { halfWidth: hw, halfHeight: hh } = gp;
        const outerHW = hw + frameThickness;
        const outerHH = hh + frameThickness;
        const [px, py, pz] = gp.center;
        const s = (px - eyeX) / dirX;
        if (s <= 0 || s >= nearestS) continue;
        const yAt = eyeY + s * dirY;
        const zAt = eyeZ + s * dirZ;
        if (Math.abs(yAt - py) < outerHH && Math.abs(zAt - pz) < outerHW) {
          nearestS = s;
          nearestHit = { slot: i, painting: gp };
        }
      }

      return nearestHit;
    },
    [],
  );

  const exitFocus = useCallback(() => {
    targetFovYRef.current = GALLERY_CONFIG.camera.fovY;
  }, []);

  const focusPainting = useCallback((hit: PaintingHit) => {
    isWalkingRef.current = false;
    targetCameraRef.current = computePaintingFocusPose(
      hit.slot,
      currentCameraRef.current,
      GALLERY_CONFIG.camera,
    );
    targetFovYRef.current = GALLERY_CONFIG.camera.focusFovY;
  }, []);

  const handleTap = useCallback(
    (tapX: number, tapY: number) => {
      const ray = buildTapRay(tapX, tapY);

      // 1. Painting hit -> stand in front of it and turn to face it.
      const paintingHit = intersectPaintings(ray);
      if (paintingHit) {
        focusPainting(paintingHit);
        return;
      }

      // 2. Empty tap -> level out the view. Does not walk; walking is on
      // long-press. Keeps walkDist where it is so the user doesn't lose
      // their place.
      exitFocus();
      targetCameraRef.current = {
        walkDist: targetCameraRef.current.walkDist,
        yaw: 0,
        pitch: 0,
      };
    },
    [buildTapRay, exitFocus, focusPainting, intersectPaintings],
  );

  const handleDragStart = useCallback(() => {
    exitFocus();
    dragModeRef.current = true;
    const { yaw, pitch } = currentCameraRef.current;
    dragStartRef.current = { yaw, pitch };
  }, [exitFocus]);

  const handleDragUpdate = useCallback(
    (translationX: number, translationY: number) => {
      const { width, height } = layoutRef.current;
      const cam = GALLERY_CONFIG.camera;

      // Drag-the-world convention: dragging right moves the world right,
      // which means the camera turns LEFT (yaw decreases). Drag down ->
      // world moves down -> camera tilts UP (pitch increases).
      const newYaw =
        dragStartRef.current.yaw - (translationX / width) * cam.dragYawRange;
      const rawPitch =
        dragStartRef.current.pitch +
        (translationY / height) * cam.dragPitchRange;
      const newPitch = Math.max(
        -cam.pitchLimit,
        Math.min(cam.pitchLimit, rawPitch),
      );

      // Drag rotates only; preserve the walkDist target.
      const prev = targetCameraRef.current;
      targetCameraRef.current = {
        walkDist: prev.walkDist,
        yaw: newYaw,
        pitch: newPitch,
      };
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    dragModeRef.current = false;
  }, []);

  const handleWalkStart = useCallback(() => {
    exitFocus();
    isWalkingRef.current = true;
  }, [exitFocus]);

  const handleWalkEnd = useCallback(() => {
    isWalkingRef.current = false;
  }, []);

  const handleDoubleTap = useCallback(() => {
    exitFocus();
    const cur = currentCameraRef.current;
    const tgt = targetCameraRef.current;
    const sign = Math.cos(cur.yaw) >= 0 ? 1 : -1;
    const step = GALLERY_CONFIG.camera.doubleTapStepDist;
    targetCameraRef.current = {
      walkDist: cur.walkDist + sign * step,
      yaw: tgt.yaw,
      pitch: tgt.pitch,
    };
  }, [exitFocus]);

  return {
    canvasRef,
    handleLayout,
    handleTap,
    handleDoubleTap,
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    handleWalkStart,
    handleWalkEnd,
    artworksLoading,
    artworkCount: artworks.length,
    loadedArtworkTextures,
  };
};
