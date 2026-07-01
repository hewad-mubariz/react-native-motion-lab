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

export type RenderScene = (timestamp: number) => void;

export type Scene = (
  props: SceneProps,
) => RenderScene | void | Promise<RenderScene | void>;

export interface UseWebGPUOptions {
  alphaMode?: GPUCanvasAlphaMode;
  onError?: (error: unknown) => void;
  onReady?: () => void;
}

export const useWebGPU = (scene: Scene, options: UseWebGPUOptions = {}) => {
  const { alphaMode = "premultiplied", onError, onReady } = options;
  const { device } = useDevice();
  const canvasRef = useRef<CanvasRef>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const context = canvasRef.current?.getContext("webgpu");
      if (!context || !device || cancelled) {
        return;
      }

      const canvas = context.canvas as HTMLCanvasElement;
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();

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
        if (cancelled) {
          return;
        }
        renderScene(Date.now());
        context.present();
        animationFrameId.current = requestAnimationFrame(render);
      };

      animationFrameId.current = requestAnimationFrame(render);
    })();

    return () => {
      cancelled = true;
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [alphaMode, device, onError, onReady, scene]);

  return canvasRef;
};
