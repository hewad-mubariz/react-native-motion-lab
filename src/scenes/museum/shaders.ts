/**
 * WGSL for the museum tunnel.
 *
 * Passes share one uniform buffer:
 *   1. Corridor — plaster walls, even-lit brick floor, recessed halo panels + wall bounce,
 *      warm ambient; perimeter cove + recessed cans
 *   2. Painting quads — gallery stripes (L/R alternating) with clustered pieces
 *
 * Wall spots share lattice with ceiling cans.
 */
export const museumWGSL = /* wgsl */ `
struct Globals {
  // 64 bytes
  viewProj:        mat4x4f,
  // xyz = camera position, w = accumulated walk distance
  cameraPos:       vec4f,
  // x = corridor half-width, y = total height, z = run length, w = time (s)
  corridor:        vec4f,
  // x = painting halfW, y = painting halfH, z = frame thickness, w = slot spacing
  paintingDims:    vec4f,
  // x = slot count, y = pieces per stripe, z = stripe count, w = artwork texture layers
  paintingMeta:    vec4f,
  // rgb = painting spotlight color, w = intensity
  lightCol:        vec4f,
  // x = spot radius, y = ambient scalar, z = fog start, w = fog end
  lightParams:     vec4f,
  fogColor:        vec4f,
  wallColor:       vec4f,
  floorColor:      vec4f,
  ceilingColor:    vec4f,
  frameColor:      vec4f,
  paintingTint:    vec4f,
  // rgb = track / lamp color, w = overall track intensity
  trackCol:        vec4f,
  // x = rail half-width, y = warm-ambient strength,
  // z = lamp size, w = lamp intensity
  trackParams:     vec4f,
  // x = brick width (m), y = row height (m), z = mortar fraction, w = color noise
  brickParams:     vec4f,
  // rgb = mortar color between bricks
  brickMortar:     vec4f,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var artSampler: sampler;
@group(0) @binding(2) var artTexture: texture_2d_array<f32>;

const PI:  f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// ============================ shared helpers ============================

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 91.3458) * 47453.5453);
}

fn periodDist(z: f32, shift: f32, period: f32) -> f32 {
  let r = (((z - shift) % period) + period) % period;
  return min(r, period - r);
}

fn palette(t: f32) -> vec3f {
  let a = vec3f(0.55, 0.45, 0.40);
  let b = vec3f(0.40, 0.45, 0.50);
  let c = vec3f(1.0, 0.9, 0.8);
  let d = vec3f(0.05, 0.20, 0.55);
  return a + b * cos(TAU * (c * t + d));
}

/** Combined baseline (cool ambient + warm room glow from ceiling panels / track). */
fn baseAmbient() -> vec3f {
  let cool = vec3f(g.lightParams.y);
  let warm = g.trackCol.rgb * g.trackParams.y;
  return cool + warm * 1.12;
}

/**
 * Neutral plaster for side walls — coarse + fine grain + linen micro-ripple
 * so gray reads tactile under spots (not flat RGB).
 */
fn wallPlasterAlbedo(wp: vec3f) -> vec3f {
  let h2 = g.corridor.y * 0.5;
  let cellY = floor(wp.y * 1.9);
  let cellZ = floor(wp.z * 0.72);
  let hCoarse = hash11(f32(i32(cellY) * 17 + i32(cellZ) * 31) + 8.2);
  let hFineA = hash11(wp.y * 14.2 + wp.z * 9.1);
  let hFineB = hash11(wp.z * 19.3 + wp.y * 6.4);
  let grain = (hCoarse - 0.5) * 0.04 + (hFineA - 0.5) * 0.028 + (hFineB - 0.5) * 0.02;
  let brush = sin(wp.y * 2.3 + wp.z * 0.12) * 0.011 + sin(wp.z * 1.1 + wp.y * 0.4) * 0.008;
  let linen = sin(wp.y * 38.0 + wp.z * 2.1) * sin(wp.z * 31.0 + wp.y * 1.7) * 0.0065;
  let footBlend = smoothstep(-h2 + 0.06, -h2 + 0.38, wp.y);
  let ao = mix(0.86, 1.0, footBlend);
  return g.wallColor.rgb * (1.0 + grain + brush + linen) * ao;
}

/** Dado / skirt band: darker gallery green-charcoal below the rail height. */
fn wallDadoTreatment(wp: vec3f, plaster: vec3f) -> vec3f {
  let h2 = g.corridor.y * 0.5;
  let dadoY = -h2 + g.corridor.y * 0.20;
  let railW = 0.028;
  let rail = exp(-pow((wp.y - dadoY) / railW, 2.0));
  let skirtCol = g.wallColor.rgb * vec3f(0.52, 0.54, 0.53);
  let above = smoothstep(dadoY, dadoY + 0.07, wp.y);
  let body = mix(skirtCol, plaster, above);
  let railCol = g.wallColor.rgb * vec3f(0.78, 0.74, 0.70);
  return mix(body, railCol, rail * 0.88);
}

/** Indirect cove wash where wall meets ceiling (warm, very soft). */
fn wallUpperCove(world: vec3f) -> vec3f {
  let h2 = g.corridor.y * 0.5;
  let t = smoothstep(h2 - 0.42, h2 - 0.06, world.y);
  return g.trackCol.rgb * g.trackCol.w * t * t * 0.26;
}

/**
 * Painting spotlight from one wall lattice (left: shift 0, right: shift stripeZ).
 */
fn spotlightFromSide(world: vec3f, sideShiftZ: f32) -> vec3f {
  let stripeZ = g.paintingDims.w;
  let period = 2.0 * stripeZ;
  let zDist = periodDist(world.z, sideShiftZ, period);
  let yDist = world.y;
  let d = length(vec2f(zDist, yDist));

  let radius = g.lightParams.x;
  let falloff = pow(1.0 - smoothstep(0.0, radius, d), 2.0);

  return g.lightCol.rgb * (falloff * g.lightCol.w);
}

fn applyFog(color: vec3f, world: vec3f) -> vec3f {
  let camDist = distance(world, g.cameraPos.xyz);
  let t = smoothstep(g.lightParams.z, g.lightParams.w, camDist);
  let coolDepth = vec3f(0.050, 0.056, 0.068);
  let fogTint = mix(g.fogColor.rgb, coolDepth, smoothstep(0.22, 1.0, t));
  let ahead = max(g.cameraPos.z - world.z, 0.0);
  let depthAir = smoothstep(320.0, 1160.0, ahead) * 0.004;
  return mix(color, fogTint + vec3f(depthAir), t);
}

/**
 * Tiny warm hints from picture-light zones farther down the corridor.
 * This keeps the dark ahead from reading as a hard empty void.
 */
fn anticipationGlow(world: vec3f) -> vec3f {
  let ahead = g.cameraPos.z - world.z;
  let forwardGate = smoothstep(16.0, 52.0, ahead) * (1.0 - smoothstep(720.0, 1160.0, ahead));
  let stripeZ = g.paintingDims.w;
  let period = 2.0 * stripeZ;
  let zDist = min(periodDist(world.z, 0.0, period), periodDist(world.z, stripeZ, period));
  let stripeGlow = exp(-zDist * zDist * 0.42);
  let h2 = g.corridor.y * 0.5;
  let upperWall = smoothstep(-h2 * 0.32, h2 * 0.48, world.y);
  let floorFalloff = 1.0 - smoothstep(-h2, -h2 + 0.85, world.y);
  let sideWall = smoothstep(0.65, 0.98, abs(world.x) / max(g.corridor.x, 0.001));
  let placement = max(upperWall * sideWall, floorFalloff * 0.34);
  return g.lightCol.rgb * stripeGlow * forwardGate * placement * 0.045;
}

// ============================ ceiling features ============================

/** Inigo-style rounded-box SDF (2D, xy plane of ceiling). */
fn sdRoundBox2D(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}

/** Long axis repeat for halo panels — larger period = fewer fixtures visible. */
fn panelPeriod() -> f32 {
  return max(g.paintingDims.w * 1.85, 3.65);
}

fn panelZLocal(worldZ: f32) -> f32 {
  let period = panelPeriod();
  let zu = worldZ / period;
  return fract(zu) * period - period * 0.5;
}

fn panelDistScale(tun: f32) -> f32 {
  return mix(0.92, 0.055, pow(smoothstep(0.9, 1020.0, tun), 0.48));
}

fn panelVisSat(tun: f32) -> vec2f {
  let vis = max(1.0 - smoothstep(76.0, 1040.0, tun), (1.0 - smoothstep(820.0, 1420.0, tun)) * 0.028);
  let sat = mix(1.0, 0.58, smoothstep(56.0, 920.0, tun));
  return vec2f(vis, sat);
}

struct PanelCtx {
  zLocal: f32,
  tunDist: f32,
  distScale: f32,
  vis: f32,
  sat: f32,
};

fn makePanelCtx(world: vec3f) -> PanelCtx {
  var out: PanelCtx;
  out.zLocal = panelZLocal(world.z);
  let panelCenterZ = world.z - out.zLocal;
  out.tunDist = abs(panelCenterZ - g.cameraPos.z);
  out.distScale = panelDistScale(out.tunDist);
  let vs = panelVisSat(out.tunDist);
  out.vis = vs.x;
  out.sat = vs.y;
  return out;
}

fn panelWarmEmissive() -> vec3f {
  return g.trackCol.rgb * g.trackCol.w;
}

/** Visible plaster tile between recessed fixtures (subtle variation). */
fn ceilingPlasterBase(world: vec3f) -> vec3f {
  let tile = hash11(floor(world.z * 0.29) + floor(world.x * 0.27) * 3.1);
  return g.ceilingColor.rgb * (0.94 + tile * 0.08);
}

/**
 * Halo LED: perspective-shrinks with distance, soft ceiling bloom, far fade + desat.
 * Downward light is added separately on floor/walls/paintings.
 */
fn ceilingPanelHaloEmission(world: vec3f, pc: PanelCtx) -> vec3f {
  let hw = max(g.corridor.x, 0.001);
  let period = panelPeriod();
  let p = vec2f(world.x, pc.zLocal);
  let ds = pc.distScale;

  let outerHalf = vec2f(hw * 0.17, period * 0.19) * ds;
  let rOut = min(outerHalf.x, outerHalf.y) * 0.34;
  let frameW = 0.042 * mix(0.88, 1.0, ds);
  let innerHalf = max(outerHalf - vec2f(frameW), vec2f(0.04));
  let rIn = min(innerHalf.x, innerHalf.y) * 0.36;

  let dOut = sdRoundBox2D(p, outerHalf, rOut);
  let dIn = sdRoundBox2D(p, innerHalf, rIn);

  let ring = (1.0 - smoothstep(0.035, -0.015, dOut)) * smoothstep(-0.02, 0.04, dIn) * (1.0 - smoothstep(0.06, 0.16, dIn));
  let bezel = (1.0 - smoothstep(0.015, -0.03, dOut)) * smoothstep(0.018, 0.048, dIn) * (1.0 - smoothstep(0.055, 0.09, dIn));
  let bleedTight = exp(-max(dOut, 0.0) * 16.0) * smoothstep(0.22, -0.02, dOut + 0.18);
  let bleedWide = exp(-max(dOut, 0.0) * 4.2) * 0.42;

  let warm = panelWarmEmissive();
  let shine = pow(clamp(ring * 2.1, 0.0, 1.0), 1.85);
  var em = warm * ring * 1.65;
  em = em + warm * shine * 0.52;
  em = em - vec3f(0.11, 0.10, 0.095) * bezel * 0.82;
  em = em + warm * (bleedTight * 0.32 + bleedWide);
  em = em * pc.vis;
  let lum = dot(em, vec3f(0.299, 0.587, 0.114));
  em = mix(vec3f(lum), em, pc.sat);
  return max(em, vec3f(0.0));
}

fn ceilingPanelCenterLift(world: vec3f, pc: PanelCtx) -> f32 {
  let hw = max(g.corridor.x, 0.001);
  let period = panelPeriod();
  let p = vec2f(world.x, pc.zLocal);
  let ds = pc.distScale;
  let outerHalf = vec2f(hw * 0.17, period * 0.19) * ds;
  let rOut = min(outerHalf.x, outerHalf.y) * 0.34;
  let frameW = 0.042 * mix(0.88, 1.0, ds);
  let innerHalf = max(outerHalf - vec2f(frameW), vec2f(0.04));
  let rIn = min(innerHalf.x, innerHalf.y) * 0.36;
  let dOut = sdRoundBox2D(p, outerHalf, rOut);
  let dIn = sdRoundBox2D(p, innerHalf, rIn);
  let inPanel = (1.0 - smoothstep(-0.02, 0.04, dOut)) * (1.0 - smoothstep(-0.02, 0.07, dIn));
  return 1.0 + inPanel * 0.028 * pc.vis;
}

/** Warm cove strip where ceiling plane meets the side walls (indirect glow). */
fn ceilingPerimeterCove(world: vec3f) -> vec3f {
  let nx = abs(world.x) / max(g.corridor.x, 0.01);
  let band = smoothstep(0.58, 0.96, nx) * (1.0 - smoothstep(0.99, 1.06, nx));
  return g.trackCol.rgb * g.trackCol.w * band * 0.40;
}

/** Rectangular coffer / panel grid — breaks up flat ceiling with soft shadow in grooves. */
fn ceilingCofferShade(world: vec3f) -> f32 {
  let hw = g.corridor.x * 0.94;
  let nx = world.x / max(hw, 0.01);
  let cellsX = 3.5;
  let cellW = g.paintingDims.w * 0.55;
  let gx = abs(fract(nx * cellsX + 0.5) - 0.5);
  let gz = abs(fract(world.z / cellW + 0.5) - 0.5);
  let beamX = smoothstep(0.38, 0.5, gx);
  let beamZ = smoothstep(0.38, 0.5, gz);
  return 1.0 - (beamX + beamZ - beamX * beamZ) * 0.085;
}

/**
 * Recessed can lights on both sides — circular core, dark baffle ring, soft halo.
 * Lattice matches painting stripes (same period as wall spots).
 */
fn ceilingLampVisible(world: vec3f) -> vec3f {
  let slotZ = g.paintingDims.w;
  let period = 2.0 * slotZ;
  let lampInset = 0.55;
  let lampX = g.corridor.x - lampInset;
  let lampSize = g.trackParams.z;
  let lampIntensity = g.trackParams.w;

  // Left row
  let zDistL = periodDist(world.z, 0.0, period);
  let xDistL = abs(world.x + lampX);
  let dL = length(vec2f(zDistL, xDistL * 1.05));
  let coreL = 1.0 - smoothstep(lampSize * 0.14, lampSize * 0.32, dL);
  let baffleL = smoothstep(lampSize * 0.30, lampSize * 0.42, dL) * (1.0 - smoothstep(lampSize * 0.52, lampSize * 0.72, dL));
  let haloL = pow(1.0 - smoothstep(0.0, lampSize * 1.35, dL), 2.8);

  // Right row
  let zDistR = periodDist(world.z, slotZ, period);
  let xDistR = abs(world.x - lampX);
  let dR = length(vec2f(zDistR, xDistR * 1.05));
  let coreR = 1.0 - smoothstep(lampSize * 0.14, lampSize * 0.32, dR);
  let baffleR = smoothstep(lampSize * 0.30, lampSize * 0.42, dR) * (1.0 - smoothstep(lampSize * 0.52, lampSize * 0.72, dR));
  let haloR = pow(1.0 - smoothstep(0.0, lampSize * 1.35, dR), 2.8);

  let core = max(coreL, coreR);
  let baffle = max(baffleL, baffleR);
  let halo = haloL + haloR;
  let warm = g.trackCol.rgb * lampIntensity;
  let darkRing = g.ceilingColor.rgb * baffle * 0.26;
  return max(warm * (core * 1.05 + halo * 0.36) - darkRing, vec3f(0.0));
}

// ============================ floor features ============================

/** Soft warm vertical wash on walls from ceiling panel spill (upper wall, along corridor). */
fn wallPanelBounce(world: vec3f, pc: PanelCtx) -> vec3f {
  let h2 = g.corridor.y * 0.5;
  let vertical = smoothstep(h2 * 0.12, h2 * 0.72, world.y);
  let nx = abs(world.x) / max(g.corridor.x, 0.001);
  let facing = smoothstep(0.78, 0.98, nx);
  let coveBand = smoothstep(h2 * 0.28, h2 * 0.86, world.y);
  return panelWarmEmissive() * facing * pc.vis * (vertical * 0.13 + coveBand * 0.12);
}

/** Running-bond brick tint in XZ (floor plane). Returns albedo before lighting. */
struct BrickCoords {
  edgeU: f32,
  varN: f32,
  brickMask: f32,
};

fn brickCoords(xz: vec2f) -> BrickCoords {
  let bw = max(g.brickParams.x, 0.05);
  let rh = max(g.brickParams.y, 0.05);
  let mf = clamp(g.brickParams.z, 0.02, 0.35);
  let row = floor(xz.y / rh);
  let rowI = i32(row);
  let bx = xz.x / bw + select(0.0, 0.5, (rowI & 1) == 1);
  let col = floor(bx);
  let colI = i32(col);
  let fx = fract(bx);
  let fz = fract(xz.y / rh);
  let edgeU = min(min(fx, 1.0 - fx), min(fz, 1.0 - fz));
  var out: BrickCoords;
  out.edgeU = edgeU;
  out.varN = hash11(f32(colI * 57 + rowI * 131) + 0.17);
  out.brickMask = smoothstep(0.0, mf * 0.5, edgeU);
  return out;
}

fn floorBrickAlbedo(xz: vec2f) -> vec3f {
  let bc = brickCoords(xz);
  let grain = sin((xz.y + bc.varN * 2.7) * 22.0) * 0.012;
  let brickRGB = g.floorColor.rgb * (0.86 + (bc.varN - 0.5) * g.brickParams.w * 1.08 + grain);
  let mort = mix(g.brickMortar.rgb, g.floorColor.rgb, 0.26);
  return mix(mort, brickRGB, bc.brickMask);
}

fn floorMortarMask(xz: vec2f) -> f32 {
  let bc = brickCoords(xz);
  let mf = clamp(g.brickParams.z, 0.02, 0.35);
  return 1.0 - smoothstep(0.0, mf * 0.75, bc.edgeU);
}

fn wallCoveLine(world: vec3f) -> vec3f {
  let h2 = g.corridor.y * 0.5;
  let topBand = exp(-pow((world.y - (h2 - 0.36)) / 0.035, 2.0));
  let side = smoothstep(0.82, 0.985, abs(world.x) / max(g.corridor.x, 0.001));
  let ahead = max(g.cameraPos.z - world.z, 0.0);
  let farFade = 1.0 - smoothstep(58.0, 96.0, ahead);
  return g.trackCol.rgb * g.trackCol.w * topBand * side * farFade * 0.95;
}

fn floorGlossReflection(world: vec3f, pc: PanelCtx) -> vec3f {
  let hw = max(g.corridor.x, 0.001);
  let ahead = max(g.cameraPos.z - world.z, 0.0);
  let forwardFade = 1.0 - smoothstep(940.0, 1460.0, ahead);
  let nearFade = smoothstep(3.0, 10.0, ahead);

  let panelPool = exp(-pc.zLocal * pc.zLocal * 0.12);
  let centerLane = exp(-pow(world.x / (hw * 0.20), 2.0));
  let longCenterSheen = exp(-pow(world.x / (hw * 0.105), 2.0)) * 0.34;
  let panelReflection = (panelPool * centerLane * 0.46 + longCenterSheen) * nearFade * forwardFade;

  let stripeZ = g.paintingDims.w;
  let period = 2.0 * stripeZ;
  let zDist = min(periodDist(world.z, 0.0, period), periodDist(world.z, stripeZ, period));
  let paintingRhythm = exp(-zDist * zDist * 0.32);
  let sideStreak = smoothstep(0.34, 0.92, abs(world.x) / hw) * (1.0 - smoothstep(0.92, 1.03, abs(world.x) / hw));
  let sideReflection = paintingRhythm * sideStreak * nearFade * forwardFade * 0.10;

  let brickLines = floorMortarMask(vec2f(world.x, world.z));
  let fineNoise = hash11(floor(world.x * 13.0) + floor(world.z * 9.0) * 19.0);
  let brokenSurface = (0.80 + fineNoise * 0.09) * (1.0 - brickLines * 0.08);
  let grazing = smoothstep(0.0, 36.0, ahead);
  let spec = (panelReflection + sideReflection) * brokenSurface * (0.34 + grazing * 0.52);
  return g.trackCol.rgb * spec * 0.34 + g.lightCol.rgb * sideReflection * 0.06;
}

// ============================ corridor (walls / floor / ceiling) ============================

struct CorridorVSOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) @interpolate(flat) face: u32,
};

fn shadeWall(world: vec3f, pc: PanelCtx) -> vec3f {
  let stripeZ = g.paintingDims.w;
  let plaster = wallPlasterAlbedo(world);
  let base = wallDadoTreatment(world, plaster);
  let shift = select(0.0, stripeZ, world.x > 0.0);
  let spot = spotlightFromSide(world, shift);
  return base * (baseAmbient() + spot)
    + wallUpperCove(world)
    + wallPanelBounce(world, pc)
    + wallCoveLine(world)
    + anticipationGlow(world);
}

fn shadeFloor(world: vec3f, pc: PanelCtx) -> vec3f {
  let base = floorBrickAlbedo(vec2f(world.x, world.z));
  let floorLift = 0.052;
  return base * (baseAmbient() + floorLift)
    + floorGlossReflection(world, pc)
    + anticipationGlow(world) * 0.25;
}

fn shadeCeiling(world: vec3f, pc: PanelCtx) -> vec3f {
  let stripeZ = g.paintingDims.w;
  let coffer = ceilingCofferShade(world);
  let panelLift = ceilingPanelCenterLift(world, pc);
  let plaster = ceilingPlasterBase(world);
  let base = plaster * coffer * panelLift;
  let sampled = vec3f(world.x, world.y * 0.4, world.z);
  let bounce = (spotlightFromSide(sampled, 0.0) + spotlightFromSide(sampled, stripeZ)) * 0.14;
  return base * (baseAmbient() + bounce)
    + ceilingPerimeterCove(world)
    + ceilingPanelHaloEmission(world, pc)
    + ceilingLampVisible(world)
    + anticipationGlow(world) * 0.48;
}

@vertex
fn corridorVertex(@builtin(vertex_index) vi: u32) -> CorridorVSOut {
  let face   = vi / 6u;
  let corner = vi % 6u;
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let q = corners[corner];

  let hw    = g.corridor.x;
  let h2    = g.corridor.y * 0.5;
  let run   = g.corridor.z;
  let camZ  = g.cameraPos.z;
  // Slide the corridor geometry with the camera so the user never reaches
  // the wall ends. Since the walls have no per-position pattern, this is
  // invisible; all lighting / fog uses true world position.
  let zNear = camZ + run * 0.5;
  let zFar  = camZ - run * 0.5;

  var world: vec3f;
  switch face {
    case 0u: { world = vec3f(-hw, mix(-h2, h2, q.y), mix(zNear, zFar, q.x)); }
    case 1u: { world = vec3f( hw, mix(-h2, h2, q.y), mix(zFar, zNear, q.x)); }
    case 2u: { world = vec3f(mix(-hw, hw, q.x), -h2, mix(zNear, zFar, q.y)); }
    default: { world = vec3f(mix(-hw, hw, q.x),  h2, mix(zFar, zNear, q.y)); }
  }

  var out: CorridorVSOut;
  out.world = world;
  out.clip  = g.viewProj * vec4f(world, 1.0);
  out.face  = face;
  return out;
}

@fragment
fn corridorFragment(in: CorridorVSOut) -> @location(0) vec4f {
  let pc = makePanelCtx(in.world);
  var lit: vec3f;

  switch in.face {
    case 0u, 1u: {
      lit = shadeWall(in.world, pc);
    }
    case 2u: {
      lit = shadeFloor(in.world, pc);
    }
    default: {
      lit = shadeCeiling(in.world, pc);
    }
  }

  return vec4f(applyFog(lit, in.world), 1.0);
}

// ============================ paintings ============================
// Gallery stripes: alternating left/right wall hangs; each stripe recycles along Z.
// pcsMax instances index into one stripe; pieceIdx < clusterCount hides extras.

struct PaintingVSOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec3f,
  @location(2) @interpolate(flat) slot: u32,
  @location(3) @interpolate(flat) center: vec3f,
  @location(4) @interpolate(flat) halfSizes: vec2f,
};

fn pcsMaxPaintings() -> u32 {
  return max(u32(i32(round(g.paintingMeta.y + 0.001))), 1u);
}

fn stripeRecycleZ(stripeIdx: u32) -> f32 {
  let stripeZ = g.paintingDims.w;
  let numStripes = max(u32(round(g.paintingMeta.z + 0.001)), 1u);
  let total = stripeZ * f32(numStripes);
  let walk = g.cameraPos.w;
  let base = f32(stripeIdx) * stripeZ;
  var offset = (((base - walk) % total) + total) % total;
  if (offset >= total * 0.5) {
    offset = offset - total;
  }
  return g.cameraPos.z - offset;
}

struct GalleryPiece {
  center: vec3f,
  halfW: f32,
  halfH: f32,
  visible: f32,
};

/** Outer half-span along corridor Z (canvas half + frame); j = piece slot within stripe. */
fn galleryOuterHalfZ(stripeIdx: u32, j: u32, frameThick: f32) -> f32 {
  let hw = g.paintingDims.x * mix(0.44, 1.05, fract(hash11(f32(stripeIdx) * 1.3 + f32(j) * 4.1 + 0.02)));
  return hw + frameThick;
}

/**
 * Lay cluster pieces along Z with gaps between framed bounds; center group on stripe anchor.
 * Pieces in a stripe share one row height (see galleryPiece cy); tall and short canvases stay on one line.
 * Keep in sync with JS galleryClusterDz.
 */
fn galleryClusterDz(pieceCntEff: u32, pieceIdx: u32, stripeIdx: u32, stripeZ: f32, frameThick: f32) -> f32 {
  let pcs = pcsMaxPaintings();
  // Fixed-cap arrays below; piecesPerStripe should stay <= 8 in app config.
  let cap = min(min(pieceCntEff, pcs), 8u);
  var ow = array<f32, 8>();
  var pz = array<f32, 8>();
  // Extra margin so framed bounds never touch; avoids depth precision shimmer when edge-on.
  let gap = max(stripeZ * 0.085, 0.22);
  for (var j = 0u; j < 8u; j = j + 1u) {
    if (j < cap) {
      ow[j] = galleryOuterHalfZ(stripeIdx, j, frameThick);
    }
  }
  pz[0] = 0.0;
  for (var j = 1u; j < 8u; j = j + 1u) {
    if (j < cap) {
      pz[j] = pz[j - 1u] + ow[j - 1u] + gap + ow[j];
    }
  }
  if (cap == 0u) {
    return 0.0;
  }
  let last = cap - 1u;
  let left = pz[0] - ow[0];
  let right = pz[last] + ow[last];
  let midGeo = 0.5 * (left + right);
  let centerZ = select(0.0, pz[pieceIdx] - midGeo, pieceIdx < cap);
  return centerZ;
}

fn galleryPiece(ii: u32) -> GalleryPiece {
  var out: GalleryPiece;
  let pcs = pcsMaxPaintings();
  let stripeIdx = ii / pcs;
  let pieceIdx = ii % pcs;

  let pieceCntEff = 1u + (stripeIdx % pcs);

  let anchorZ = stripeRecycleZ(stripeIdx);
  let leftWall = (stripeIdx % 2u) == 0u;
  let side = select(1.0, -1.0, leftWall);
  let stripeZ = g.paintingDims.w;
  let frameThick = g.paintingDims.z;
  let dz = galleryClusterDz(pieceCntEff, pieceIdx, stripeIdx, stripeZ, frameThick);
  let h2 = g.corridor.y * 0.5;
  let cyRaw = stripeZ * mix(-0.04, 0.095, fract(hash11(f32(stripeIdx) * 2.9)));
  let hw = g.paintingDims.x * mix(0.44, 1.05, fract(hash11(f32(stripeIdx) * 1.3 + f32(pieceIdx) * 4.1 + 0.02)));
  let hhRaw = g.paintingDims.y * mix(0.50, 1.15, fract(hash11(f32(stripeIdx) * 2.1 + f32(pieceIdx) * 3.7 + 0.09)));
  let hh = min(hhRaw, 0.82);
  let floorClear = max(0.72, g.corridor.y * 0.19);
  let ceilPad = max(0.22, g.corridor.y * 0.060);
  let minCy = -h2 + floorClear + hh + frameThick;
  let maxCy = h2 - ceilPad - hh - frameThick;
  let cy = clamp(cyRaw, minCy, maxCy);

  let wallX = side * g.corridor.x;
  // Frames sit slightly off the wall so camera motion creates real micro-parallax.
  let inset = 0.038 + f32(ii) * 0.000045;
  let x = wallX - side * inset;
  out.center = vec3f(x, cy, anchorZ + dz);
  out.halfW = hw;
  out.halfH = hh;
  let inCluster = pieceIdx < pieceCntEff;
  out.visible = select(0.0, 1.0, inCluster);
  return out;
}

@vertex
fn paintingVertex(
  @builtin(vertex_index)   vi: u32,
  @builtin(instance_index) ii: u32,
) -> PaintingVSOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  let q = corners[vi];

  let gp = galleryPiece(ii);
  let frame = g.paintingDims.z;
  let outerHW = gp.halfW + frame;
  let outerHH = gp.halfH + frame;
  let visible = gp.visible;

  let world = vec3f(
    gp.center.x,
    gp.center.y + q.y * outerHH * visible,
    gp.center.z + q.x * outerHW * visible,
  );

  var out: PaintingVSOut;
  out.clip = g.viewProj * vec4f(world, 1.0);
  out.uv = q;
  out.world = world;
  out.slot = ii;
  out.center = gp.center;
  out.halfSizes = vec2f(gp.halfW, gp.halfH);
  return out;
}

/** Soft fill from ceiling panel downlight so canvases are not only spot-lit. */
fn paintingPanelFill(world: vec3f, pc: PanelCtx) -> vec3f {
  let period = panelPeriod();
  let ds = pc.distScale;
  let az = period * 0.48 * ds + 0.18;
  let softZ = pow(max(0.0, 1.0 - (pc.zLocal * pc.zLocal) / (az * az)), 1.2);
  let h2 = g.corridor.y * 0.5;
  let vy = smoothstep(-h2 * 0.4, h2 * 0.55, world.y) * (1.0 - smoothstep(h2 * 0.72, h2 * 1.02, world.y));
  return panelWarmEmissive() * softZ * vy * pc.vis * 0.16;
}

@fragment
fn paintingFragment(in: PaintingVSOut) -> @location(0) vec4f {
  let pc = makePanelCtx(in.world);
  let halfW = in.halfSizes.x;
  let halfH = in.halfSizes.y;
  let frame = g.paintingDims.z;
  let outerHW = halfW + frame;
  let outerHH = halfH + frame;

  let p  = vec2f(in.uv.x * outerHW, in.uv.y * outerHH);
  let dx = halfW - abs(p.x);
  let dy = halfH - abs(p.y);
  let insideCanvas = min(dx, dy);

  let edge = 0.0015;
  let canvasMask = smoothstep(-edge, edge, insideCanvas);

  let wallSide = sign(in.center.x);
  let viewDir = normalize(g.cameraPos.xyz - in.world);
  let viewSlide = dot(viewDir, vec3f(0.0, 0.0, wallSide));
  let viewRise = dot(viewDir, vec3f(0.0, 1.0, 0.0));
  let canvasInset = smoothstep(0.0, 0.10, insideCanvas);
  let artParallax = vec2f(viewSlide, -viewRise) * canvasInset * 0.010;

  let n01  = vec2f(p.x / halfW, p.y / halfH) + artParallax;
  let r    = length(n01);
  let artUv = clamp(
    vec2f(n01.x * 0.5 + 0.5, 0.5 - n01.y * 0.5),
    vec2f(0.001),
    vec2f(0.999),
  );
  let artLayers = max(u32(i32(round(g.paintingMeta.w + 0.001))), 1u);
  let artLayer = i32(in.slot % artLayers);
  let art = textureSample(artTexture, artSampler, artUv, artLayer).rgb;
  let canvasVignette = 1.0 - smoothstep(0.92, 1.18, r) * 0.08;
  let glassBand = n01.x * 0.62 + n01.y * 0.34 + viewSlide * 0.56 - viewRise * 0.16;
  let glassSheen =
    exp(-glassBand * glassBand * 34.0) *
    smoothstep(0.08, 0.42, abs(viewSlide) + abs(viewRise) * 0.35) *
    canvasMask *
    0.14;
  let edgeDepthShadow =
    (1.0 - smoothstep(0.0, 0.12, insideCanvas)) *
    canvasMask *
    (0.18 + abs(viewSlide) * 0.18);
  let painting = art * canvasVignette * (1.0 - edgeDepthShadow);

  let frameDepth = clamp(-insideCanvas / frame, 0.0, 1.0);
  let innerLip = 1.0 - smoothstep(0.0, 0.24, frameDepth);
  let outerLip = smoothstep(0.68, 1.0, frameDepth);
  let crown = sin(PI * frameDepth);
  let grooveA = 1.0 - smoothstep(0.035, 0.0, abs(frameDepth - 0.22));
  let grooveB = 1.0 - smoothstep(0.045, 0.0, abs(frameDepth - 0.74));
  let cornerPad =
    smoothstep(0.62, 0.96, abs(p.x) / outerHW) *
    smoothstep(0.62, 0.96, abs(p.y) / outerHH);
  let carvedNoise =
    (hash11(floor(abs(p.x) * 34.0) + floor(abs(p.y) * 42.0) * 7.0 + f32(in.slot)) - 0.5) *
    0.045;
  let frameProfile =
    0.56 +
    crown * 0.38 +
    outerLip * 0.18 -
    innerLip * 0.12 -
    grooveA * 0.23 -
    grooveB * 0.16 +
    cornerPad * 0.16 +
    carvedNoise;
  let frameStyle = hash11(f32(in.slot) * 5.17 + 0.31);
  let warmGold = g.frameColor.rgb;
  let darkBronze = vec3f(0.36, 0.24, 0.12);
  let paleGold = vec3f(0.78, 0.62, 0.34);
  let blackWood = vec3f(0.035, 0.031, 0.027);
  let sizeStyle = smoothstep(1.55, 2.15, halfW + halfH);
  var frameBase = mix(warmGold, paleGold, smoothstep(0.22, 0.55, frameStyle));
  frameBase = mix(frameBase, darkBronze, smoothstep(0.56, 0.72, frameStyle) * 0.45);
  frameBase = mix(frameBase, blackWood, smoothstep(0.83, 0.98, frameStyle) * (1.0 - sizeStyle * 0.55));
  let rabbet =
    (1.0 - smoothstep(0.0, 0.055, frameDepth)) *
    (1.0 - canvasMask);
  let frameTone = mix(frameBase * frameProfile, vec3f(0.020, 0.016, 0.012), rabbet * 0.88);

  let d = length(vec2f(in.world.z - in.center.z, in.world.y - in.center.y));
  let falloff = pow(1.0 - smoothstep(0.0, g.lightParams.x, d), 2.0);
  let spot = g.lightCol.rgb * (falloff * g.lightCol.w);
  let panelFill = paintingPanelFill(in.world, pc);
  let frameLit = frameTone * (baseAmbient() + spot) + panelFill * 0.35;
  let paintingLit = painting * 1.06 + g.trackCol.rgb * glassSheen;
  let lit = mix(frameLit, paintingLit, canvasMask);

  return vec4f(applyFog(lit, in.world), 1.0);
}

`;
