/**
 * Tunable constants for the museum tunnel.
 *
 * The renderer is engineered so visual tuning lives almost entirely here:
 * change a number, get a new look without touching shader code.
 */
export const MUSEUM_CONFIG = {
  corridor: {
    /** Distance from center to each side wall. Combined with `camera.lateralLean`,
     *  the *effective* viewing distance when rotated 90° is halfWidth + lean.
     *  Needs to be large enough that visible vertical span at that distance
     *  (= 2 * (halfWidth+lean) * tan(fovY/2)) exceeds `height`, otherwise the
     *  wall fills the whole frame and looks claustrophobic on rotation. */
    halfWidth: 3.5,
    /** Floor-to-ceiling height. Floor at -h/2, ceiling at +h/2. */
    height: 3.7,
    /** How far ahead/behind the camera the corridor geometry extends.
     *  This is centered around the camera, so the visible forward reach is
     *  roughly run / 2. Keep it beyond the camera far plane to avoid seeing
     *  a rectangular black opening where the tunnel mesh ends. */
    run: 3600,
  },
  painting: {
    /** Base artwork half-size (scaled per piece by gallery strip layout). ~1.4m × 2.0m. */
    halfWidth: 0.7,
    halfHeight: 1.0,
    frameThickness: 0.08,
    /** Z spacing between alternating L/R strip anchors — smaller = denser walls. */
    stripeSpacing: 4.0,
    /** Instances attempted per stripe; extras collapse (cluster of 1–4). */
    piecesPerStripe: 4,
    /** Recycle pool; slotCount = stripes × pieces. Keep total length beyond the visible range. */
    stripeCount: 80,
    /** Total frame instances = 80 × 4. Artwork textures repeat across these slots. */
    slotCount: 320,
    /** Keep framed artwork comfortably above the floor/base barrier. */
    floorClearance: 0.72,
    /** Keep frames away from the ceiling and picture lights. */
    ceilingClearance: 0.22,
    /** Hard cap on displayed canvas height so tall images never dominate the wall. */
    maxHalfHeight: 0.82,
  },
  camera: {
    /** Eye height relative to the corridor's vertical center. */
    eyeY: 0.0,
    /** Exponential ease toward tap / double-tap targets (1/s). */
    approachRate: 3.6,
    /**
     * Per-channel bands for smoothing the end of a move: `closeFactor` ramps
     * from 1→0 across each band; their average boosts `approachRate` toward
     * `approachFinishMultiplier` (no hard on/off step).
     */
    approachFinishWalk: 0.14,
    approachFinishYaw: 0.07,
    approachFinishPitch: 0.07,
    approachFinishFov: 0.04,
    approachFinishMultiplier: 2.65,
    /** Walking speed (world units / second) while long-press is held. */
    walkSpeed: 3.5,
    /** Forward target offset on double tap (world units); camera eases toward it via approachRate. */
    doubleTapStepDist: 5.0,
    /** Footstep bob. Scales down to 0 when the camera is stationary. */
    bobAmplitude: 0.022,
    bobFrequency: 2.4,
    /** Vertical FOV. Slightly tighter lens lengthens the perceived corridor. */
    fovY: Math.PI * 0.21,
    /** Narrower lens used when a tapped painting is being inspected. */
    focusFovY: Math.PI * 0.19,
    near: 0.05,
    far: 1550,
    /** Maximum pitch (radians). Stops just shy of straight up/down to
     *  avoid lookAt gimbal lock when forward aligns with world up. */
    pitchLimit: Math.PI * 0.5 - 0.12,
    /** Lateral camera offset as a function of yaw. Camera slides toward the
     *  *opposite* wall as it rotates, so when facing a wall (yaw=±π/2) the
     *  viewing distance is halfWidth+lateralLean instead of halfWidth.
     *  Mimics a person stepping back to look at a painting and is the main
     *  fix for the "wall is right in my face" feeling on rotation.
     *  eyeX = -sin(yaw) * lateralLean. */
    lateralLean: 0.7,
    /** A full-screen-width horizontal drag rotates yaw by this many radians.
     *  Smaller = more deliberate / less twitchy rotation. */
    dragYawRange: (Math.PI * 2) / 3,
    /** A full-screen-height vertical drag rotates pitch by this many radians. */
    dragPitchRange: Math.PI * 0.5,
    /** Min movement (px) before Pan wins over Tap. Smaller = tap loses easily. */
    panMinDistance: 8,
    /** Long-press hold duration (ms) before walking starts. */
    longPressDuration: 200,
    /** Max finger drift (px) tolerated during a long-press before it cancels
     *  (and walking stops). Large enough to ignore minor jitter, small
     *  enough that a real drag is treated as a drag, not a walk. */
    longPressMaxDistance: 30,
  },
  palette: {
    /** Neutral gallery plaster (lit by spots + ambient). WGSL adds fine grain + variation. */
    wall: [0.52, 0.51, 0.505],
    /** Brick floor grout / mortar tint (between bricks). Multiplied procedural. */
    brickMortar: [0.12, 0.1, 0.088],
    /** Polished-stone fallback base under the procedural brick tint. */
    floor: [0.19, 0.15, 0.12],
    /** Ceiling plaster between fixtures (visible mid gray, not void). */
    ceiling: [0.22, 0.218, 0.22],
    /** Gold-toned painting frames. */
    frame: [0.62, 0.45, 0.22],
    /** Multiplied with the per-slot generated painting colors. */
    paintingTint: [0.96, 0.92, 0.83],
  },
  lighting: {
    /** Warm painting spotlight color and how hard it punches. */
    spotColor: [1.0, 0.84, 0.58],
    spotIntensity: 1.9,
    /** Half-radius of the spotlight splash on a wall (world units). */
    spotRadius: 1.55,
    /** Neutral baseline ambient added to every surface. */
    ambient: 0.48,
  },
  /** Continuous ceiling track + lamp fixtures aligned with each painting. */
  track: {
    /** ~2800–3000K cream (not clinical white). */
    color: [1.0, 0.945, 0.82],
    /** Brightness of the visible ceiling strip + downward wash. */
    intensity: 1.18,
    /** Half-width of the visible center strip on the ceiling. */
    railHalfWidth: 0.08,
    /** Multiplies the warm "room glow" ambient added to every surface. */
    warmAmbientStrength: 0.58,
    /** Size of the visible lamp fixture spots on the ceiling. */
    lampSize: 0.22,
    /** Brightness of the lamp fixtures themselves. */
    lampIntensity: 1.6,
  },
  brick: {
    /** Brick width and row height in world metres (floor X / Z repeats). */
    width: 0.42,
    rowHeight: 0.145,
    /** Mortar groove width fraction of one brick (0–1-ish). */
    mortarFraction: 0.09,
    /** Subtle per-brick tonal scatter (0–1). */
    colorNoise: 0.14,
    /** Rows alternate by half brick for a running bond. */
    staggering: true as boolean,
  },
  fog: {
    /** Deep cool gallery air, not pure black. */
    color: [0.028, 0.03, 0.035],
    start: 320.0,
    end: 1250.0,
  },
} as const;
