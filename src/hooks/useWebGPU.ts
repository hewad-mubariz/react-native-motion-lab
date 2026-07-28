import { useEffect, useRef } from "react";
import { PixelRatio } from "react-native";
import {
  useDevice,
  type CanvasRef,
  type NativeCanvas,
} from "react-native-wgpu";

export interface SceneProps {
  context: GPUCanvasContext;
  device: GPUDevice;
  gpu: GPU;
  presentationFormat: GPUTextureFormat;
  canvas: NativeCanvas;
}

// May return false to signal nothing was drawn this frame (informational only).
export type RenderScene = (timestamp: number) => boolean | void;

export type Scene = (
  props: SceneProps,
) => RenderScene | void | Promise<RenderScene | void>;

export interface UseWebGPUOptions {
  alphaMode?: GPUCanvasAlphaMode;
  maxPixelRatio?: number;
  onError?: (error: unknown) => void;
  onReady?: () => void;
  // Caller may pass a ref to receive a function that wakes the render loop
  // when it is in a reduced-rate idle state (for future use).
  wakeRef?: React.RefObject<(() => void) | null>;
}

export const useWebGPU = (scene: Scene, options: UseWebGPUOptions = {}) => {
  const { alphaMode = "premultiplied", maxPixelRatio = 2, onError, onReady, wakeRef } = options;
  const { device } = useDevice();
  const canvasRef = useRef<CanvasRef>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Expose a no-op wake function so callers don't need to guard wakeRef.
    if (wakeRef) (wakeRef as React.MutableRefObject<(() => void) | null>).current = () => {};

    (async () => {
      const context = canvasRef.current?.getContext("webgpu");
      if (!context || !device || cancelled) {
        return;
      }

      const canvas = context.canvas as HTMLCanvasElement;
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      const pixelRatio = Math.min(PixelRatio.get(), maxPixelRatio);
      canvas.width = canvas.clientWidth * pixelRatio;
      canvas.height = canvas.clientHeight * pixelRatio;

      context.configure({
        device,
        format: presentationFormat,
        alphaMode,
      });

      const sceneProps: SceneProps = {
        context,
        device,
        gpu: navigator.gpu,
        presentationFormat,
        canvas: context.canvas as unknown as NativeCanvas,
      };

      let renderScene: RenderScene | void;

      try {
        const result = scene(sceneProps);
        renderScene =
          result instanceof Promise ? await result : (result as RenderScene);
      } catch (error) {
        if (!cancelled) {
          onError?.(error);
        }
        return;
      }

      if (cancelled || typeof renderScene !== "function") {
        return;
      }

      onReady?.();

      const render = () => {
        if (cancelled) return;
        renderScene(Date.now());
        // present() must be called every tick to keep the display pipeline alive.
        context.present();
        animationFrameId.current = requestAnimationFrame(render);
      };

      animationFrameId.current = requestAnimationFrame(render);
    })();

    return () => {
      cancelled = true;
      if (wakeRef) (wakeRef as React.MutableRefObject<(() => void) | null>).current = null;
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [alphaMode, device, maxPixelRatio, onError, onReady, scene, wakeRef]);

  return canvasRef;
};
