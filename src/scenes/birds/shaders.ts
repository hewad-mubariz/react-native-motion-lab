import { BIRD_COUNT, WORKGROUP_SIZE } from "./constants";

// Shared uniform layout used by every shader in the bird scene. Keeping it
// defined once at the top of each WGSL string keeps the bindings in sync.
const UNIFORMS_DECL = /* wgsl */ `
struct Uniforms {
  aspectScale: f32,
  time: f32,
  deltaTime: f32,
  padding: f32,
  disturbance: vec4f,
  effect: vec4f,
};
`;

export const birdRenderWGSL = /* wgsl */ `
const BIRD_COUNT = ${BIRD_COUNT}u;

${UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec4f>;
@group(0) @binding(2) var<storage, read> velocities: array<vec4f>;
@group(0) @binding(3) var<storage, read> phases: array<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) part: f32,
  @location(1) localPosition: vec2f,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen background quad rendered as the first 6 vertices.
  var backgroundPositions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0)
  );

  var birdPositions = array<vec2f, 9>(
    vec2f(0.00, 0.42),
    vec2f(-0.08, -0.04),
    vec2f(0.00, -0.56),

    vec2f(0.00, 0.16),
    vec2f(-0.52, -0.08),
    vec2f(0.00, -0.08),

    vec2f(0.00, -0.08),
    vec2f(0.52, -0.08),
    vec2f(0.00, 0.16)
  );

  var output: VertexOutput;

  if (vertexIndex < 6u) {
    let position = backgroundPositions[vertexIndex];
    output.position = vec4f(position, 0.0, 1.0);
    output.part = 0.0;
    output.localPosition = position;
    return output;
  }

  let birdGlobalIndex = vertexIndex - 6u;
  let birdIndex = birdGlobalIndex / 9u;
  let birdVertexIndex = birdGlobalIndex % 9u;

  var position = birdPositions[birdVertexIndex];
  let phase = phases[birdIndex];
  let flap = sin(phase) * 0.18;

  if (birdVertexIndex == 4u || birdVertexIndex == 7u) {
    position.y += flap;
  }

  let birdWorldPosition = positions[birdIndex].xy;
  let velocity = velocities[birdIndex].xy;
  let speed = max(length(velocity), 0.0001);
  let angle = atan2(velocity.y, velocity.x) - 1.5708;
  let size = 0.022 + positions[birdIndex].w * 0.055;
  let birdPosition = position * size;
  let rotatedPosition = vec2f(
    birdPosition.x * cos(angle) - birdPosition.y * sin(angle),
    birdPosition.x * sin(angle) + birdPosition.y * cos(angle)
  );
  let worldPosition = birdWorldPosition + rotatedPosition;
  let correctedPosition = vec2f(worldPosition.x, worldPosition.y / uniforms.aspectScale);

  output.position = vec4f(correctedPosition, 0.0, 1.0);
  output.part = 1.0 + f32(birdVertexIndex / 3u) + speed * 0.01;
  output.localPosition = correctedPosition;
  return output;
}

@fragment
fn fragmentMain(
  @location(0) part: f32,
  @location(1) localPosition: vec2f
) -> @location(0) vec4f {
  if (part < 0.5) {
    let t = localPosition.y * 0.5 + 0.5;
    let horizon = vec3f(0.86, 0.82, 1.0);
    let zenith = vec3f(0.62, 0.64, 0.94);
    let skyColor = horizon * (1.0 - t) + zenith * t;
    return vec4f(skyColor, 1.0);
  }

  return vec4f(0.0, 0.0, 0.0, 1.0);
}
`;

export const computeVelocityWGSL = /* wgsl */ `
const BIRD_COUNT = ${BIRD_COUNT}u;
const SPEED_LIMIT = 0.82;

${UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positionsIn: array<vec4f>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velocitiesOut: array<vec4f>;
@group(0) @binding(4) var<storage, read> formationTargets: array<vec4f>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;
  if (i >= BIRD_COUNT) {
    return;
  }

  let position = positionsIn[i].xy;
  var velocity = velocitiesIn[i].xy;
  var separation = vec2f(0.0);
  var alignment = vec2f(0.0);
  var cohesion = vec2f(0.0);
  var neighborCount = 0.0;

  for (var j = 0u; j < BIRD_COUNT; j = j + 1u) {
    if (i == j) {
      continue;
    }

    let otherPosition = positionsIn[j].xy;
    let toOther = otherPosition - position;
    let distanceToOther = length(toOther);

    if (distanceToOther < 0.001 || distanceToOther > 0.34) {
      continue;
    }

    if (distanceToOther < 0.075) {
      separation -= normalize(toOther) * (0.075 - distanceToOther);
    }

    alignment += velocitiesIn[j].xy;
    cohesion += otherPosition;
    neighborCount += 1.0;
  }

  if (neighborCount > 0.0) {
    alignment = normalize(alignment / neighborCount) * 0.12;
    cohesion = (cohesion / neighborCount - position) * 0.075;
    separation = separation * 2.6;
    velocity += (separation + alignment + cohesion) * uniforms.deltaTime;
  }

  let seconds = uniforms.time * 0.001;
  let birdNoise = velocitiesIn[i].w;
  let showTarget = vec2f(
    sin(seconds * 0.31) * 0.28 + sin(seconds * 0.11) * 0.10,
    (cos(seconds * 0.23) * 0.18 + sin(seconds * 0.13) * 0.08) * uniforms.aspectScale
  );
  let toTarget = showTarget - position;
  let distanceToTarget = max(length(toTarget), 0.001);
  let targetDirection = toTarget / distanceToTarget;
  let tangent = vec2f(-targetDirection.y, targetDirection.x);
  let gatherPulse = 0.5 + 0.5 * sin(seconds * 0.21);
  let holdPulse = smoothstep(0.62, 0.96, sin(seconds * 0.11) * 0.5 + 0.5);
  let birdSide = select(-1.0, 1.0, birdNoise > 0.5);
  let flockInfluence = 1.0 - uniforms.effect.x;

  velocity += targetDirection * (0.10 + gatherPulse * 0.10 + holdPulse * 0.18) * flockInfluence * uniforms.deltaTime;
  velocity += tangent * birdSide * (0.12 + (1.0 - gatherPulse) * 0.18 - holdPulse * 0.08) * flockInfluence * uniforms.deltaTime;

  if (uniforms.effect.x > 0.5) {
    let formationTarget = formationTargets[i].xy;
    let toFormation = formationTarget - position;
    let distanceToFormation = max(length(toFormation), 0.001);
    velocity += (toFormation / distanceToFormation) * min(distanceToFormation, 0.75) * 7.0 * uniforms.deltaTime;
    velocity *= 1.0 - 4.2 * uniforms.deltaTime;
  }

  let ribbonAngle = seconds * 0.18;
  let ribbonDirection = vec2f(cos(ribbonAngle), sin(ribbonAngle));
  let ribbonNormal = vec2f(-ribbonDirection.y, ribbonDirection.x);
  let ribbonDistance = dot(position - showTarget, ribbonNormal);
  velocity -= ribbonNormal * ribbonDistance * holdPulse * 0.22 * flockInfluence * uniforms.deltaTime;

  let flow = vec2f(
    sin(position.y * 1.8 + seconds * 0.72 + birdNoise * 6.28318),
    cos(position.x * 2.4 - seconds * 0.61 + birdNoise * 3.14159)
  ) * 0.085;
  velocity += flow * flockInfluence * uniforms.deltaTime;

  let awayFromDisturbance = position - uniforms.disturbance.xy;
  let distanceToDisturbance = length(awayFromDisturbance);
  let disturbanceRadius = 0.46;

  if (uniforms.disturbance.z > 0.001 && distanceToDisturbance < disturbanceRadius) {
    let disturbanceDirection = awayFromDisturbance / max(distanceToDisturbance, 0.001);
    let disturbanceFalloff = 1.0 - distanceToDisturbance / disturbanceRadius;
    velocity += disturbanceDirection * disturbanceFalloff * disturbanceFalloff * uniforms.disturbance.z * 5.5 * uniforms.deltaTime;
  }

  let halfHeight = uniforms.aspectScale * 1.02;
  if (position.x < -0.98) {
    velocity.x += (-0.98 - position.x) * 0.75 * uniforms.deltaTime;
  }
  if (position.x > 0.98) {
    velocity.x -= (position.x - 0.98) * 0.75 * uniforms.deltaTime;
  }
  if (position.y < -halfHeight) {
    velocity.y += (-halfHeight - position.y) * 0.75 * uniforms.deltaTime;
  }
  if (position.y > halfHeight) {
    velocity.y -= (position.y - halfHeight) * 0.75 * uniforms.deltaTime;
  }

  velocity *= 0.996;

  let speed = length(velocity);
  if (speed > SPEED_LIMIT) {
    velocity = normalize(velocity) * SPEED_LIMIT;
  }

  velocitiesOut[i] = vec4f(velocity, 0.0, velocitiesIn[i].w);
}
`;

export const computePositionWGSL = /* wgsl */ `
const BIRD_COUNT = ${BIRD_COUNT}u;

${UNIFORMS_DECL}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positionsIn: array<vec4f>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<vec4f>;
@group(0) @binding(3) var<storage, read> phasesIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> positionsOut: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> phasesOut: array<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3u) {
  let i = globalId.x;
  if (i >= BIRD_COUNT) {
    return;
  }

  let velocity = velocitiesIn[i].xy;
  var position = positionsIn[i].xy + velocity * uniforms.deltaTime;
  let halfHeight = uniforms.aspectScale * 1.08;

  position = clamp(position, vec2f(-1.16, -halfHeight), vec2f(1.16, halfHeight));

  let phase = phasesIn[i] + uniforms.deltaTime * (8.0 + length(velocity) * 10.0);
  positionsOut[i] = vec4f(position, 0.0, positionsIn[i].w);
  phasesOut[i] = phase;
}
`;
