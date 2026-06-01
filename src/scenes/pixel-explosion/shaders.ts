export const pixelExplosionWGSL = /* wgsl */ `
struct Particle {
  origin: vec2f,
  exploded: vec2f,
  uv: vec2f,
  meta: vec2f,
};

struct Globals {
  viewport: vec4f,
  motion: vec4f,
  style: vec4f,
  color: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) alpha: f32,
  @location(2) glow: f32,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
@group(0) @binding(2) var tigerSampler: sampler;
@group(0) @binding(3) var tigerTexture: texture_2d<f32>;

const CORNERS = array<vec2f, 6>(
  vec2f(-0.5, -0.5),
  vec2f( 0.5, -0.5),
  vec2f(-0.5,  0.5),
  vec2f(-0.5,  0.5),
  vec2f( 0.5, -0.5),
  vec2f( 0.5,  0.5)
);

fn smoothEdge(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOut {
  let p = particles[instanceIndex];
  let centerDist = p.meta.x;
  let jitter = p.meta.y;
  let baseProgress = g.motion.x;
  let time = g.motion.y;
  let force = g.motion.z;

  let delayMode = g.style.z;
  let delay = mix(centerDist, 1.0 - centerDist, delayMode) * 0.34 + jitter * 0.1;
  let localProgress = smoothEdge((baseProgress - delay) / max(1.0 - delay, 0.001));
  let magneticOvershoot = sin(localProgress * 3.14159265) * (1.0 - baseProgress) * 8.0;
  let drift = vec2f(
    sin(time * 2.1 + jitter * 17.0),
    cos(time * 1.8 + jitter * 13.0)
  ) * baseProgress * 5.0;

  let exploded = p.origin + (p.exploded - p.origin) * force;
  let pos = mix(p.origin, exploded, localProgress) + drift + normalize(p.origin + vec2f(0.001)) * magneticOvershoot;
  let pulse = 1.0 + sin(time * 8.0 + jitter * 14.0) * 0.08 * baseProgress;
  let size = g.style.x * mix(0.78, 1.35, localProgress) * pulse;
  let corner = CORNERS[vertexIndex] * size;
  let pixel = pos + corner;

  var out: VertexOut;
  out.position = vec4f(
    (pixel.x / g.viewport.x) * 2.0,
    -(pixel.y / g.viewport.y) * 2.0,
    0.0,
    1.0
  );
  out.uv = p.uv;
  out.alpha = mix(1.0, 0.72 + jitter * 0.22, baseProgress);
  out.glow = localProgress;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  let texel = textureSample(tigerTexture, tigerSampler, in.uv);
  
  // 1. Calculate your stylized appearance
  let luminance = dot(texel.rgb, vec3f(0.299, 0.587, 0.114));
  let procedural = vec3f(0.95, 0.43 + in.uv.y * 0.22, 0.08) * (0.38 + in.uv.x * 0.28);
  let imageColor = mix(procedural, texel.rgb, smoothstep(0.03, 0.18, luminance));
  
  // Scale the extra sparks and edges based directly on glow/movement intensity
  let warmSpark = vec3f(1.0, 0.42, 0.08) * in.glow * 0.32;
  let coolEdge = vec3f(0.06, 0.72, 1.0) * (1.0 - in.glow) * 0.08 * in.glow; // <-- Multiplied by in.glow to disappear at 0!
  
  let stylizedColor = imageColor * (1.0 + in.glow * 0.38) + warmSpark + coolEdge;
  let stylizedAlpha = in.alpha * mix(0.38, 1.0, smoothstep(0.015, 0.14, luminance + texel.a * 0.08));
  
  // 2. Master Mix: If in.glow is 0, this outputs EXACTLY the raw image pixel
  let finalColor = mix(texel.rgb, stylizedColor, in.glow);
  let finalAlpha = mix(texel.a, stylizedAlpha, in.glow);

  return vec4f(finalColor, finalAlpha);
}
`;

export const tigerParticlesWGSL = /* wgsl */ `
struct Particle {
  position: vec2f,
  uv: vec2f,
  chunkDir: vec2f,
  chunkForce: f32,
  spinSpeed: f32,
};

struct Globals {
  viewport: vec4f,
  image: vec4f,
  style: vec4f,
  effects: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
@group(0) @binding(2) var tigerSampler: sampler;
@group(0) @binding(3) var tigerTexture: texture_2d<f32>;

const CORNERS = array<vec2f, 6>(
  vec2f(-0.5, -0.5),
  vec2f( 0.5, -0.5),
  vec2f(-0.5,  0.5),
  vec2f(-0.5,  0.5),
  vec2f( 0.5, -0.5),
  vec2f( 0.5,  0.5)
);

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn easeOutCubic(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  let inv = 1.0 - x;
  return 1.0 - inv * inv * inv;
}

fn easeInOutCubic(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.5) {
    return 4.0 * x * x * x;
  }
  let y = -2.0 * x + 2.0;
  return 1.0 - (y * y * y) * 0.5;
}

@vertex
fn particlesVertex(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOut {
  let particle = particles[instanceIndex];
  let shatter = clamp(g.image.w, 0.0, 1.0);
  let fall = clamp(g.effects.x, 0.0, 1.0);
  let reform = clamp(g.effects.y, 0.0, 1.0);

  let boom = easeOutCubic(shatter);
  let random = hash21(particle.uv);
  let random2 = hash21(particle.uv + vec2f(3.7, 9.1));
  // g.effects.w = 1 in the chunk shatter scene, 0 in the fine-pixel slider scene
  let chunkMode = g.effects.w;

  // Fine-pixel mode: each pixel gets its own unique swirl direction (original slider behaviour).
  // Chunk mode: exact shared direction — no per-pixel variance so the block stays solid.
  var direction: vec2f;
  var distance: f32;
  if (chunkMode > 0.5) {
    direction = particle.chunkDir;
    distance = particle.chunkForce * g.image.z * boom * 0.30;
  } else {
    let radial = normalize(particle.position + vec2f((random - 0.5) * 8.0, (random2 - 0.5) * 8.0));
    let swirl = vec2f(-radial.y, radial.x) * (random - 0.5) * (0.55 + shatter * 2.0);
    direction = normalize(radial + swirl);
    let shortThrow = smoothstep(0.0, 0.22, random);
    let longThrow = pow(random2, 1.9);
    let distFromCenter = length(particle.position);
    let edgeScale = smoothstep(0.0, g.viewport.x * 0.15, distFromCenter);
    distance = (28.0 + shortThrow * 155.0 + longThrow * 620.0) * g.image.z * boom * (0.05 + edgeScale * 0.95);
  }
  // In chunkMode use a per-chunk random (not per-pixel random2) so gravity is identical
  // for every pixel in the chunk — prevents the block from fanning out vertically.
  let gravityRand = select(random2, hash21(vec2f(particle.chunkForce, particle.spinSpeed)), chunkMode > 0.5);
  let gravity = vec2f(0.0, 22.0) * shatter * shatter * (0.3 + gravityRand * 0.7) * mix(1.0, 0.50, chunkMode);
  let explodedPosition = particle.position + direction * distance + gravity;

  // Fall cascade from bottom-left (confirmed good — unchanged)
  let originWave = length(particle.uv - vec2f(0.0, 1.0)) / 1.41421356;
  let waveDelay = originWave * 0.78 + random * 0.12;
  let fallLocal = easeOutCubic((fall - waveDelay) / max(1.0 - waveDelay, 0.001));
  let riseDelay = (1.0 - originWave) * 0.24 + random2 * 0.14;
  let riseLocal = easeInOutCubic((reform - riseDelay) / max(1.0 - riseDelay, 0.001));

  let bottomY = g.viewport.y * (0.43 + random2 * 0.13);
  let pileSpread = smoothstep(0.08, 1.0, originWave);
  let pileX = (particle.uv.x - 0.5) * g.viewport.x * (0.28 + pileSpread * 0.58) + (random - 0.5) * 170.0;
  let pile = vec2f(pileX, bottomY + sin(random * 31.0) * 34.0);
  let fallArc = vec2f(
    sin(fallLocal * 9.0 + random * 6.28) * (28.0 + random2 * 62.0),
    sin(fallLocal * 3.14159265) * -(62.0 + random * 116.0)
  );
  let bounce = sin(fallLocal * 18.8495559 + random * 6.28) * (1.0 - fallLocal) * 34.0;

  let fallingPosition = mix(explodedPosition, pile, fallLocal) + fallArc + vec2f(0.0, bounce);
  let activePosition = mix(fallingPosition, explodedPosition, riseLocal);

  // Safety-net: at rest (shatter=0, fall=0) locks to exact source pixel positions
  let overallMovementFactor = max(shatter, fall);
  let finalPosition = mix(particle.position, activePosition, overallMovementFactor);

  // Per-chunk spin during shatter flight; fall has its own spin below
  let shatterSpin = particle.spinSpeed * boom * (1.0 - fall);

  // In chunk mode: each chunk gets a unique size (big+small mix). Fine-pixel scene: uniform.
  let sizeHashRand = select(
    hash21(particle.uv * 47.3 + vec2f(5.1, 9.7)),
    hash21(vec2f(particle.chunkForce, particle.spinSpeed) + vec2f(3.3, 1.7)),
    chunkMode > 0.5
  );
  // Chunk range 1.2-2.0: always ≥ 1 so particles overlap and chunks stay solid (no sub-pixel gaps).
  // Fine mode: chunkMode=0 so boom*chunkMode=0 → chunkSizeVar=1.0 always (no change to slider).
  let chunkSizeVar = mix(1.0, 1.20 + sizeHashRand * 0.80, boom * chunkMode);

  let sizePulse = select(mix(1.0, 0.68 + random * 0.62, shatter), 1.0, chunkMode > 0.5);
  let fallChunk = smoothstep(0.72, 0.94, random2);
  let fallVisibility = smoothstep(0.001, 0.08, fall) * fallChunk * (1.0 - smoothstep(0.96, 1.0, reform));
  let cubeSize = g.style.x * chunkSizeVar * mix(sizePulse, 2.2 + random * 2.8, fallVisibility);

  // Fall spin (original behaviour) layered on top of shatter spin
  let fallSpin = (random - 0.5) * 7.0 * fallLocal * (1.0 - riseLocal) * overallMovementFactor;
  let totalSpin = shatterSpin + fallSpin;
  let cosA = cos(totalSpin);
  let sinA = sin(totalSpin);
  let baseCorner = CORNERS[vertexIndex];
  let corner = vec2f(
    baseCorner.x * cosA - baseCorner.y * sinA,
    baseCorner.x * sinA + baseCorner.y * cosA
  );
  let pixel = finalPosition + corner * cubeSize;

  var out: VertexOut;
  out.position = vec4f(
    (pixel.x / g.viewport.x) * 2.0,
    -(pixel.y / g.viewport.y) * 2.0,
    0.0,
    1.0
  );

  let tileUv = vec2f(g.effects.z / g.image.x, g.effects.z / g.image.y);
  out.uv = clamp(particle.uv + CORNERS[vertexIndex] * tileUv, vec2f(0.0), vec2f(1.0));
  return out;
}

@fragment
fn particlesFragment(in: VertexOut) -> @location(0) vec4f {
  let color = textureSample(tigerTexture, tigerSampler, in.uv);
  let shatter = clamp(g.image.w, 0.0, 1.0);
  let fall = clamp(g.effects.x, 0.0, 1.0);
  let effectMix = smoothstep(0.001, 0.08, max(shatter, fall));
  // g.viewport.z carries the scene-level alpha (1.0 normally; fades to 0 at end of chunk reassembly)
  let sceneAlpha = g.viewport.z;

  let particleColor = mix(vec3f(1.0), color.rgb, g.style.w);
  let heat = vec3f(1.0, 0.42, 0.08) * smoothstep(0.08, 0.82, shatter) * 0.18;

  let stylizedColor = (particleColor + heat) * g.style.z;
  let stylizedAlpha = color.a * g.style.y;

  let finalColor = mix(color.rgb, stylizedColor, effectMix);
  let finalAlpha = mix(color.a, stylizedAlpha, effectMix) * sceneAlpha;

  return vec4f(finalColor, finalAlpha);
}
`;

export const tigerChunksWGSL = /* wgsl */ `
struct Chunk {
  origin: vec2f,
  size: vec2f,
  uvCenter: vec2f,
  uvSize: vec2f,
  direction: vec2f,
  force: f32,
  spinSpeed: f32,
};

struct Globals {
  viewport: vec4f,
  image: vec4f,
  style: vec4f,
  effects: vec4f,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> chunks: array<Chunk>;
@group(0) @binding(2) var tigerSampler: sampler;
@group(0) @binding(3) var tigerTexture: texture_2d<f32>;

const CORNERS = array<vec2f, 6>(
  vec2f(-0.5, -0.5),
  vec2f( 0.5, -0.5),
  vec2f(-0.5,  0.5),
  vec2f(-0.5,  0.5),
  vec2f( 0.5, -0.5),
  vec2f( 0.5,  0.5)
);

fn easeOutCubic(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  let inv = 1.0 - x;
  return 1.0 - inv * inv * inv;
}

@vertex
fn chunksVertex(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOut {
  let chunk = chunks[instanceIndex];
  let progress = clamp(g.image.w, 0.0, 1.0);
  let boom = easeOutCubic(progress);
  let spin = chunk.spinSpeed * sin(progress * 3.14159265) * 0.82;
  let cosA = cos(spin);
  let sinA = sin(spin);
  let corner = CORNERS[vertexIndex];
  let local = corner * chunk.size;
  let rotated = vec2f(
    local.x * cosA - local.y * sinA,
    local.x * sinA + local.y * cosA
  );
  let gravity = vec2f(0.0, 14.0) * progress * progress;
  let center = chunk.origin + chunk.direction * chunk.force * g.image.z * boom + gravity;
  let pixel = center + rotated;

  var out: VertexOut;
  out.position = vec4f(
    (pixel.x / g.viewport.x) * 2.0,
    -(pixel.y / g.viewport.y) * 2.0,
    0.0,
    1.0
  );
  out.uv = clamp(chunk.uvCenter + corner * chunk.uvSize, vec2f(0.0), vec2f(1.0));
  return out;
}

@fragment
fn chunksFragment(in: VertexOut) -> @location(0) vec4f {
  let color = textureSample(tigerTexture, tigerSampler, in.uv);
  return vec4f(color.rgb, color.a * g.viewport.z);
}
`;
