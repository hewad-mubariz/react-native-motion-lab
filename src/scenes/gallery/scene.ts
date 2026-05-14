import type { Scene } from "@/hooks/useWebGPU";
import type { ArticArtwork } from "@/services/artic";
import type { RefObject } from "react";
import { GALLERY_CONFIG } from "./config";
import { cameraBasis } from "./geometry";
import { mat4Create, mat4LookAt, mat4Multiply, mat4Perspective } from "./math";
import { galleryWGSL } from "./shaders";

const UNIFORM = 0x40;
const COPY_DST = 0x8;

const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const ARTWORK_FORMAT: GPUTextureFormat = "rgba8unorm";
const ARTWORK_TEXTURE_SIZE = 256;
const ARTWORK_TEXTURE_LAYERS = 80;

const CORRIDOR_VERTEX_COUNT = 24;
const PAINTING_VERTEX_COUNT = 6;

/**
 * Uniform buffer layout (must match the WGSL `Globals` struct).
 *
 *   float idx   bytes        contents
 *   0..15       0..63        viewProj           mat4x4f
 *   16..19      64..79       cameraPos          vec4f  (xyz, walkDist)
 *   20..23      80..95       corridor           vec4f  (halfW, height, run, time)
 *   24..27      96..111      paintingDims       vec4f  (halfW, halfH, frameThick, stripeSpacing)
 *   28..31      112..127     paintingMeta       vec4f  (slotCount, piecesPerStripe, stripeCount, artworkTextureLayers)
 *   32..35      128..143     lightCol           vec4f  (rgb, intensity)
 *   36..39      144..159     lightParams        vec4f  (radius, ambient, fogStart, fogEnd)
 *   40..43      160..175     fogColor           vec4f
 *   44..47      176..191     wallColor          vec4f
 *   48..51      192..207     floorColor         vec4f
 *   52..55      208..223     ceilingColor       vec4f
 *   56..59      224..239     frameColor         vec4f
 *   60..63      240..255     paintingTint       vec4f
 *   64..67      256..271     trackCol           vec4f  (rgb, intensity)
 *   68..71      272..287     trackParams        vec4f  (railHalfW, warmAmb, lampSize, lampInt)
 *   72..75      288..303     brickParams        vec4f  (width, rowH, mortarFrac, colorNoise)
 *   76..79      304..319     brickMortar        vec4f  (rgb, _)
 */
const UNIFORM_BUFFER_SIZE = 320;

/** Full camera state. Smoothly approached by the render loop. */
export interface CameraState {
  /** Accumulated forward translation. Camera Z = -walkDist. */
  walkDist: number;
  /** Yaw (left/right). 0 = looking down -Z, +π/2 = looking +X. */
  yaw: number;
  /** Pitch (up/down). 0 = level, + = looking up. Clamped in handlers. */
  pitch: number;
}

/**
 * Refs the scene reads / writes each frame.
 *
 *   target  : where the user wants the camera (set by tap / drag handlers).
 *   current : where the camera actually is right now (written by the scene
 *             each frame; the React side reads this to compute tap rays).
 *   drag    : when true, the scene snaps yaw/pitch directly to target. Used
 *             for drag-to-rotate so the camera feels glued to the finger.
 *   walking : when true, the scene integrates walkDist along the corridor each
 *             frame at camera.walkSpeed (and keeps target.walkDist from lagging
 *             behind that path). walkDist still eases toward target every frame
 *             with approachRate (same as painting focus), so double-tap bumps
 *             animate smoothly while walking too.
 *
 * Priority: walking > smoothing for walkDist; drag > smoothing for yaw/pitch.
 * The three modes are exclusive in the React gesture layer
 * (Gesture.Race), so we don't need to worry about all three active at once.
 */
export interface GalleryControls {
  targetCameraRef: RefObject<CameraState>;
  currentCameraRef: RefObject<CameraState>;
  targetFovYRef: RefObject<number>;
  currentFovYRef: RefObject<number>;
  dragModeRef: RefObject<boolean>;
  isWalkingRef: RefObject<boolean>;
}

export interface GallerySceneOptions {
  artworks?: ArticArtwork[];
  onArtworkLoaded?: (count: number) => void;
}

/** Smooth Hermite edge. Returns 0 at x<=e0, 1 at x>=e1. */
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * 1 when error is ~0, 0 when error >= outerBand (smooth in between).
 * Avoids a binary “finish band” that jumps approach rate in one frame.
 */
const closeFactor = (absErr: number, outerBand: number): number =>
  1 - smoothstep(0, outerBand, absErr);

/** Normalize an angle to [-π, π]. */
const wrapAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

const makePlaceholderPixels = (layer: number) => {
  const pixels = new Uint8Array(
    ARTWORK_TEXTURE_SIZE * ARTWORK_TEXTURE_SIZE * 4,
  );
  const seed = layer * 17.31;

  for (let y = 0; y < ARTWORK_TEXTURE_SIZE; y++) {
    for (let x = 0; x < ARTWORK_TEXTURE_SIZE; x++) {
      const i = (y * ARTWORK_TEXTURE_SIZE + x) * 4;
      const u = x / (ARTWORK_TEXTURE_SIZE - 1);
      const v = y / (ARTWORK_TEXTURE_SIZE - 1);
      const grain = Math.sin((x + seed) * 0.13) * Math.sin((y - seed) * 0.11);
      pixels[i] = 95 + u * 45 + grain * 10;
      pixels[i + 1] = 72 + v * 38 + grain * 8;
      pixels[i + 2] = 56 + (1 - u) * 28 + grain * 7;
      pixels[i + 3] = 255;
    }
  }

  return pixels;
};

const seedArtworkTexture = (device: GPUDevice, texture: GPUTexture) => {
  for (let layer = 0; layer < ARTWORK_TEXTURE_LAYERS; layer++) {
    device.queue.writeTexture(
      { texture, origin: [0, 0, layer] },
      makePlaceholderPixels(layer),
      {
        bytesPerRow: ARTWORK_TEXTURE_SIZE * 4,
        rowsPerImage: ARTWORK_TEXTURE_SIZE,
      },
      [ARTWORK_TEXTURE_SIZE, ARTWORK_TEXTURE_SIZE, 1],
    );
  }
};

const loadArtworkTextures = async (
  device: GPUDevice,
  texture: GPUTexture,
  artworks: ArticArtwork[],
  onArtworkLoaded?: (count: number) => void,
) => {
  let loaded = 0;
  const slots = ARTWORK_TEXTURE_LAYERS;

  for (let layer = 0; layer < slots; layer++) {
    const artwork = artworks[layer % artworks.length];
    if (!artwork) continue;

    try {
      const response = await fetch(artwork.imageUrl, {
        headers: {
          Referer: "https://www.artic.edu/",
          "User-Agent": "Mozilla/5.0 ReactNativeWebGPU Gallery",
        },
      });
      if (!response.ok) continue;

      const imageBitmap = await createImageBitmap(await response.blob());
      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture, origin: [0, 0, layer] },
        [ARTWORK_TEXTURE_SIZE, ARTWORK_TEXTURE_SIZE, 1],
      );
      loaded += 1;
      onArtworkLoaded?.(loaded);
    } catch {
      // Keep the seeded placeholder for this slot; one missing image should
      // never break the whole gallery.
    }
  }

  onArtworkLoaded?.(slots);
};

export const makeGalleryScene = (
  controls: GalleryControls,
  options: GallerySceneOptions = {},
): Scene => {
  return ({ context, device, presentationFormat, canvas }) => {
    const shader = device.createShaderModule({ code: galleryWGSL });

    const makePipeline = (vsEntry: string, fsEntry: string) =>
      device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: vsEntry },
        fragment: {
          module: shader,
          entryPoint: fsEntry,
          targets: [{ format: presentationFormat }],
        },
        primitive: { topology: "triangle-list" },
        depthStencil: {
          format: DEPTH_FORMAT,
          depthCompare: "less",
          depthWriteEnabled: true,
        },
      });

    const corridorPipeline = makePipeline("corridorVertex", "corridorFragment");
    const paintingPipeline = makePipeline("paintingVertex", "paintingFragment");

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: UNIFORM | COPY_DST,
    });
    const artworkTexture = device.createTexture({
      size: [
        ARTWORK_TEXTURE_SIZE,
        ARTWORK_TEXTURE_SIZE,
        ARTWORK_TEXTURE_LAYERS,
      ],
      format: ARTWORK_FORMAT,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const artworkSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    seedArtworkTexture(device, artworkTexture);

    if (options.artworks && options.artworks.length > 0) {
      void loadArtworkTextures(
        device,
        artworkTexture,
        options.artworks,
        options.onArtworkLoaded,
      );
    }

    const corridorBindGroup = device.createBindGroup({
      layout: corridorPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const paintingBindGroup = device.createBindGroup({
      layout: paintingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: artworkSampler },
        {
          binding: 2,
          resource: artworkTexture.createView({ dimension: "2d-array" }),
        },
      ],
    });

    const aspect = canvas.width / Math.max(canvas.height, 1);
    const projMatrix = mat4Create();
    const viewMatrix = mat4Create();
    const viewProj = mat4Create();

    const uniformBytes = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniformBytes);

    const writeStatic = () => {
      const c = GALLERY_CONFIG;
      f32[20] = c.corridor.halfWidth;
      f32[21] = c.corridor.height;
      f32[22] = c.corridor.run;
      f32[24] = c.painting.halfWidth;
      f32[25] = c.painting.halfHeight;
      f32[26] = c.painting.frameThickness;
      f32[27] = c.painting.stripeSpacing;
      f32[28] = c.painting.slotCount;
      f32[29] = c.painting.piecesPerStripe;
      f32[30] = c.painting.stripeCount;
      f32[31] = ARTWORK_TEXTURE_LAYERS;
      f32[72] = c.brick.width;
      f32[73] = c.brick.rowHeight;
      f32[74] = c.brick.mortarFraction;
      f32[75] = c.brick.colorNoise;
      f32[76] = c.palette.brickMortar[0];
      f32[77] = c.palette.brickMortar[1];
      f32[78] = c.palette.brickMortar[2];
      f32[79] = 0;
      f32[32] = c.lighting.spotColor[0];
      f32[33] = c.lighting.spotColor[1];
      f32[34] = c.lighting.spotColor[2];
      f32[35] = c.lighting.spotIntensity;
      f32[36] = c.lighting.spotRadius;
      f32[37] = c.lighting.ambient;
      f32[38] = c.fog.start;
      f32[39] = c.fog.end;
      f32[40] = c.fog.color[0];
      f32[41] = c.fog.color[1];
      f32[42] = c.fog.color[2];
      f32[44] = c.palette.wall[0];
      f32[45] = c.palette.wall[1];
      f32[46] = c.palette.wall[2];
      f32[48] = c.palette.floor[0];
      f32[49] = c.palette.floor[1];
      f32[50] = c.palette.floor[2];
      f32[52] = c.palette.ceiling[0];
      f32[53] = c.palette.ceiling[1];
      f32[54] = c.palette.ceiling[2];
      f32[56] = c.palette.frame[0];
      f32[57] = c.palette.frame[1];
      f32[58] = c.palette.frame[2];
      f32[60] = c.palette.paintingTint[0];
      f32[61] = c.palette.paintingTint[1];
      f32[62] = c.palette.paintingTint[2];
      f32[64] = c.track.color[0];
      f32[65] = c.track.color[1];
      f32[66] = c.track.color[2];
      f32[67] = c.track.intensity;
      f32[68] = c.track.railHalfWidth;
      f32[69] = c.track.warmAmbientStrength;
      f32[70] = c.track.lampSize;
      f32[71] = c.track.lampIntensity;
    };
    writeStatic();

    const { fog } = GALLERY_CONFIG;
    const clearValue: GPUColor = {
      r: fog.color[0],
      g: fog.color[1],
      b: fog.color[2],
      a: 1,
    };

    let lastTime = 0;
    let walkDist = 0;
    let yaw = 0;
    let pitch = 0;
    let fovY = GALLERY_CONFIG.camera.fovY;

    return (time: number) => {
      if (lastTime === 0) lastTime = time;
      const dt = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;

      const target = controls.targetCameraRef.current ?? {
        walkDist: 0,
        yaw: 0,
        pitch: 0,
      };
      const dragging = controls.dragModeRef.current === true;
      const walking = controls.isWalkingRef.current === true;
      const targetFovY =
        controls.targetFovYRef.current ?? GALLERY_CONFIG.camera.fovY;
      const camCfg = GALLERY_CONFIG.camera;

      yaw = wrapAngle(yaw);
      const dWalkPre = target.walkDist - walkDist;
      const tgtYawPre = wrapAngle(target.yaw);
      const dYawPre = Math.abs(wrapAngle(tgtYawPre - yaw));
      const dPitchPre = Math.abs(target.pitch - pitch);
      const dFovPre = Math.abs(targetFovY - fovY);

      // Finish ease: ramp approach rate smoothly as each channel nears target.
      // (A boolean finish band multiplied rate by ~4× in one step — felt like a snap.)
      const fw = closeFactor(Math.abs(dWalkPre), camCfg.approachFinishWalk);
      const fy = closeFactor(dYawPre, camCfg.approachFinishYaw);
      const fp = closeFactor(dPitchPre, camCfg.approachFinishPitch);
      const ff = closeFactor(dFovPre, camCfg.approachFinishFov);
      const finishBlend =
        dragging || walking ? 0 : (fw + fy + fp + ff) / 4;
      const approachRate =
        camCfg.approachRate *
        (1 + finishBlend * (camCfg.approachFinishMultiplier - 1));
      const alpha = Math.min(1, 1 - Math.exp(-dt * approachRate));

      // ---- walkDist ----
      // Long-press advances the camera; double tap only moves target.walkDist
      // (like painting focus). We always ease walkDist toward target with
      // approachRate. While walking, raise target to never fall behind the
      // integrated path so normal stroll stays tight, but a bumps-ahead
      // target (double tap) still pulls the camera smoothly.
      if (walking) {
        const sign = Math.cos(yaw) >= 0 ? 1 : -1;
        walkDist += sign * GALLERY_CONFIG.camera.walkSpeed * dt;
        if (target.walkDist < walkDist) {
          target.walkDist = walkDist;
        }
      }
      const dWalk = target.walkDist - walkDist;
      walkDist += dWalk * alpha;

      // ---- yaw / pitch ----
      if (dragging) {
        // Snap so the camera tracks the dragging finger 1:1.
        yaw = target.yaw;
        pitch = target.pitch;
      } else {
        const tgtYaw = wrapAngle(target.yaw);
        const dYaw = wrapAngle(tgtYaw - yaw);
        yaw = wrapAngle(yaw + dYaw * alpha);

        const dPitch = target.pitch - pitch;
        pitch += dPitch * alpha;
      }
      const dFov = targetFovY - fovY;
      fovY += dFov * alpha;

      // Publish current state for the React side (tap raycast etc.).
      const cur = controls.currentCameraRef.current;
      if (cur) {
        cur.walkDist = walkDist;
        cur.yaw = yaw;
        cur.pitch = pitch;
      }
      if (controls.currentFovYRef.current !== undefined) {
        controls.currentFovYRef.current = fovY;
      }

      // Footstep bob only while long-press walking — not during tap focus /
      // double-tap ease (sin bob reads as endless image drift).
      const motion = walking ? 1 : 0;
      const bob =
        Math.sin(walkDist * GALLERY_CONFIG.camera.bobFrequency) *
        GALLERY_CONFIG.camera.bobAmplitude *
        motion;

      const camZ = -walkDist;
      const eyeY = GALLERY_CONFIG.camera.eyeY + bob;
      // Lateral lean: as the camera turns toward a wall, slide toward the
      // opposite wall so the apparent viewing distance grows from
      // halfWidth to halfWidth + lateralLean at yaw = ±π/2. Smooth in yaw,
      // so during a drag the camera "leans back" continuously.
      const eyeX = -Math.sin(yaw) * GALLERY_CONFIG.camera.lateralLean;
      const { forward } = cameraBasis(yaw, pitch);

      mat4Perspective(
        projMatrix,
        fovY,
        aspect,
        GALLERY_CONFIG.camera.near,
        GALLERY_CONFIG.camera.far,
      );
      mat4LookAt(
        viewMatrix,
        [eyeX, eyeY, camZ],
        [eyeX + forward[0], eyeY + forward[1], camZ + forward[2]],
        [0, 1, 0],
      );
      mat4Multiply(viewProj, projMatrix, viewMatrix);

      f32.set(viewProj, 0);
      f32[16] = eyeX;
      f32[17] = eyeY;
      f32[18] = camZ;
      f32[19] = walkDist;
      f32[23] = time / 1000;

      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue,
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      pass.setPipeline(corridorPipeline);
      pass.setBindGroup(0, corridorBindGroup);
      pass.draw(CORRIDOR_VERTEX_COUNT);

      pass.setPipeline(paintingPipeline);
      pass.setBindGroup(0, paintingBindGroup);
      pass.draw(PAINTING_VERTEX_COUNT, GALLERY_CONFIG.painting.slotCount);

      pass.end();
      device.queue.submit([encoder.finish()]);
    };
  };
};
