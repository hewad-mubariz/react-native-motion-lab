import {
  BIRD_COUNT,
  BIRD_RENDER_MULTIPLIER,
  WORKGROUP_SIZE,
} from "./constants";

// Shared uniform layout used by every shader in the bird scene. Keeping it

// defined once at the top of each WGSL string keeps the bindings in sync.

const UNIFORMS_DECL = /* wgsl */ `

struct Uniforms {

aspectScale: f32,

time: f32,

deltaTime: f32,

skyPreset: f32,

disturbance: vec4f,

effect: vec4f,

};

`;

export const birdRenderWGSL = /* wgsl */ `

const BIRD_COUNT = ${BIRD_COUNT}u;
const BIRD_RENDER_MULTIPLIER = ${BIRD_RENDER_MULTIPLIER}u;



${UNIFORMS_DECL}



@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@group(0) @binding(1) var<storage, read> positions: array<vec4f>;

@group(0) @binding(2) var<storage, read> velocities: array<vec4f>;

@group(0) @binding(3) var<storage, read> phases: array<f32>;



struct VertexOutput {

@builtin(position) position: vec4f,

@location(0) part: f32,

@location(1) screenPosition: vec2f,

@location(2) birdColor: vec4f,

};



// Jagged noise for the mountains

fn hash(p: f32) -> f32 {

let p2 = fract(p * 0.1031);

let p3 = p2 * (p2 + 33.33);

return fract(p3 * (p2 + p2));

}



fn noise(x: f32) -> f32 {

let i = floor(x);

let f = fract(x);

let u = f * f * (3.0 - 2.0 * f);

return mix(hash(i), hash(i + 1.0), u);

}



fn skyGradient(uv: vec2f, bottom: vec3f, middle: vec3f, top: vec3f) -> vec3f {

let t = clamp(uv.y * 0.5 + 0.5, 0.0, 1.0);

let lower = smoothstep(0.0, 0.62, t);

let upper = smoothstep(0.38, 1.0, t);

return mix(mix(bottom, middle, lower), top, upper);

}



fn mountainHeight(x: f32) -> f32 {

// Layered noise for more realistic rocky terrain

var y = noise(x * 3.5 + 1.2) * 0.04;

y += noise(x * 8.2 + 4.5) * 0.015;

y += noise(x * 18.0 + 9.1) * 0.005;


// Specific peaks to guide the silhouette

let centerPeak = exp(-pow((x - 0.20) * 3.1, 2.0)) * 0.04;

let leftPeak = exp(-pow((x + 0.70) * 4.8, 2.0)) * 0.035;


return -0.740 + y + centerPeak + leftPeak;

}



fn skyColor(screenPosition: vec2f) -> vec3f {

let uv = screenPosition;

let t = clamp(uv.y * 0.5 + 0.5, 0.0, 1.0);

let preset = i32(uniforms.skyPreset + 0.5);

var color: vec3f;



if (preset == 1) {

color = skyGradient(uv, vec3f(0.86, 0.67, 0.70), vec3f(0.58, 0.55, 0.72), vec3f(0.28, 0.34, 0.56));

} else if (preset == 2) {

color = skyGradient(uv, vec3f(0.78, 0.86, 0.96), vec3f(0.50, 0.67, 0.88), vec3f(0.22, 0.39, 0.68));

} else if (preset == 3) {

color = skyGradient(uv, vec3f(0.78, 0.30, 0.16), vec3f(0.50, 0.39, 0.54), vec3f(0.18, 0.25, 0.46));

} else {

color = skyGradient(uv, vec3f(0.98, 0.38, 0.10), vec3f(0.63, 0.50, 0.63), vec3f(0.22, 0.29, 0.50));

}



var sun = vec2f(0.0, -0.885);

if (preset == 3) {

let scenicSunX = -0.18;

sun = vec2f(scenicSunX, mountainHeight(scenicSunX) + 0.010);

}

let sunPixelSpace = (uv - sun) * vec2f(1.0, uniforms.aspectScale);

let sunDiscDistance = length(sunPixelSpace);

let sunRadius = select(0.058, 0.034, preset == 3);

let sunDisc = 1.0 - smoothstep(sunRadius, sunRadius + 0.004, sunDiscDistance);

let sunRim = 1.0 - smoothstep(sunRadius + 0.004, sunRadius + 0.020, sunDiscDistance);

let sunGlowDistance = length((uv - sun) * vec2f(0.82, uniforms.aspectScale * 0.42));

let sunGlow = exp(-sunGlowDistance * 2.7);

let warmHorizon = exp(-abs(uv.y + 0.78) * 2.1) * (1.0 - smoothstep(0.2, 1.0, abs(uv.x)));



if (preset == 1) {

let mistBand =
  exp(-abs(uv.y + 0.18) * 3.4) *
  (0.55 + noise(uv.x * 2.1 + 3.0) * 0.45);
color = mix(color, vec3f(0.76, 0.70, 0.82), mistBand * 0.10);

} else if (preset == 2) {

color += vec3f(0.92, 0.73, 0.46) * sunGlow * 0.18;

} else if (preset == 3) {

let cloudBand =
  exp(-abs(uv.y + 0.49) * 14.0) *
  (0.45 + noise(uv.x * 3.2 + 8.0) * 0.55) *
  (1.0 - smoothstep(0.72, 1.0, abs(uv.x)));
let lowerCloudBand =
  exp(-abs(uv.y + 0.58) * 22.0) *
  (0.35 + noise(uv.x * 5.4 + 2.0) * 0.65) *
  (1.0 - smoothstep(0.78, 1.0, abs(uv.x)));

color += vec3f(1.0, 0.34, 0.08) * sunGlow * 0.16;
color += vec3f(0.88, 0.26, 0.08) * warmHorizon * 0.10;
color = mix(color, vec3f(0.34, 0.18, 0.24), cloudBand * 0.28);
color = mix(color, vec3f(0.42, 0.18, 0.16), lowerCloudBand * 0.22);
color = mix(color, vec3f(1.0, 0.50, 0.13), sunRim * 0.30);
color = mix(color, vec3f(1.0, 0.78, 0.24), sunDisc);

} else {

color += vec3f(1.0, 0.38, 0.06) * sunGlow * 0.34;

color += vec3f(1.0, 0.46, 0.14) * warmHorizon * 0.28;

color = mix(color, vec3f(1.0, 0.54, 0.12), sunRim * 0.45);

color = mix(color, vec3f(1.0, 0.92, 0.34), sunDisc);

}



let waterTop = -0.735;

if (uv.y < waterTop && preset == 3) {

let waterDepth = clamp((waterTop - uv.y) / (1.0 + waterTop), 0.0, 1.0);

let shorelineFade = smoothstep(0.00, 0.14, waterDepth);

let reflectedSky = skyGradient(

vec2f(uv.x, -uv.y - 1.26),

vec3f(0.54, 0.13, 0.07),

vec3f(0.25, 0.075, 0.085),

vec3f(0.10, 0.065, 0.12)

);

let ripple1 = 1.0 - smoothstep(0.000, 0.008, abs(fract((uv.y + 1.0) * 72.0 + sin(uv.x * 7.0) * 0.05) - 0.5));

let ripple2 = 1.0 - smoothstep(0.000, 0.010, abs(fract((uv.y + 1.0) * 126.0 + sin(uv.x * 15.0) * 0.035) - 0.5));

let sunColumn = exp(-pow((uv.x + 0.18) * 13.0, 2.0)) * exp(-waterDepth * 3.7);

let reflection = (ripple1 * 0.040 + ripple2 * 0.026 + sunColumn * 0.48) * (1.0 - waterDepth * 0.38) * shorelineFade;

let waterBase = mix(vec3f(0.20, 0.060, 0.060), vec3f(0.055, 0.025, 0.040), waterDepth);

color = mix(waterBase, reflectedSky, 0.38 * shorelineFade);

color += vec3f(0.92, 0.25, 0.070) * reflection;

color = mix(color, vec3f(0.050, 0.022, 0.028), (1.0 - shorelineFade) * 0.16);

}



let ridgeY = mountainHeight(uv.x);

let aboveWater = smoothstep(waterTop - 0.010, waterTop + 0.010, uv.y);

let mountainMask = smoothstep(ridgeY + 0.006, ridgeY - 0.004, uv.y) * aboveWater;

let backRidgeY = ridgeY - 0.035 + noise(uv.x * 4.4 - 0.8) * 0.02;

let backMountainMask = smoothstep(backRidgeY + 0.010, backRidgeY - 0.006, uv.y) * aboveWater;

let mountainLight = clamp((uv.y - waterTop) / 0.16, 0.0, 1.0);

let backMountainColor = mix(vec3f(0.070, 0.050, 0.072), vec3f(0.125, 0.078, 0.096), mountainLight);

let frontMountainColor = mix(vec3f(0.024, 0.022, 0.034), vec3f(0.056, 0.040, 0.058), mountainLight);

color = mix(color, backMountainColor, backMountainMask * select(0.0, 1.0, preset == 3));

color = mix(color, frontMountainColor, mountainMask * select(0.0, 1.0, preset == 3));



let scenicHorizonLine = 1.0 - smoothstep(-0.995, -0.985, uv.y);

let horizonLine = select(0.0, scenicHorizonLine, preset == 3);

let horizonColor = vec3f(0.025, 0.020, 0.025);

color = mix(color, horizonColor, horizonLine);



let vignette = smoothstep(1.42, 0.2, length(uv * vec2f(0.78, 0.92)));

color *= 0.90 + vignette * 0.10;

color = mix(color, color * vec3f(0.86, 0.90, 1.0), smoothstep(0.55, 1.0, t) * 0.08);

return clamp(color, vec3f(0.0), vec3f(1.0));

}



@vertex

fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {

var backgroundPositions = array<vec2f, 6>(

vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),

vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)

);



var birdPositions = array<vec2f, 9>(

vec2f(0.00, 0.42), vec2f(-0.08, -0.04), vec2f(0.00, -0.56),

vec2f(0.00, 0.16), vec2f(-0.52, -0.08), vec2f(0.00, -0.08),

vec2f(0.00, -0.08), vec2f(0.52, -0.08), vec2f(0.00, 0.16)

);



var output: VertexOutput;



if (vertexIndex < 6u) {

let position = backgroundPositions[vertexIndex];

output.position = vec4f(position, 0.0, 1.0);

output.part = 0.0;

output.screenPosition = position;

output.birdColor = vec4f(0.0);

return output;

}



let birdGlobalIndex = vertexIndex - 6u;

let visualBirdIndex = birdGlobalIndex / 9u;

let birdIndex = visualBirdIndex % BIRD_COUNT;

let duplicateIndex = visualBirdIndex / BIRD_COUNT;

let birdVertexIndex = birdGlobalIndex % 9u;



var position = birdPositions[birdVertexIndex];

let phase = phases[birdIndex];

let flap = sin(phase) * 0.18;



if (birdVertexIndex == 4u || birdVertexIndex == 7u) {

position.y += flap;

}



var birdWorldPosition = positions[birdIndex].xy;

let velocity = velocities[birdIndex].xy;

let speed = max(length(velocity), 0.0001);

let angle = atan2(velocity.y, velocity.x) - 1.5708;

let depth = positions[birdIndex].w;

let birdNoise = velocities[birdIndex].w;

if (duplicateIndex > 0u) {

let duplicatePhase = birdNoise * 6.28318 + f32(duplicateIndex) * 2.39996;

let duplicateRadius = 0.010 + birdNoise * 0.014;

birdWorldPosition += vec2f(cos(duplicatePhase), sin(duplicatePhase * 1.37)) * duplicateRadius;

}

let size = mix(0.009, 0.030, pow(depth, 1.45)) * (0.86 + birdNoise * 0.34);

let birdPosition = position * size;

let rotatedPosition = vec2f(

birdPosition.x * cos(angle) - birdPosition.y * sin(angle),

birdPosition.x * sin(angle) + birdPosition.y * cos(angle)

);

let worldPosition = birdWorldPosition + rotatedPosition;

let correctedPosition = vec2f(worldPosition.x, worldPosition.y / uniforms.aspectScale);



output.position = vec4f(correctedPosition, 0.0, 1.0);

output.part = 1.0 + f32(birdVertexIndex / 3u) + speed * 0.01;

output.screenPosition = correctedPosition;



let vertical = clamp(birdWorldPosition.y / max(uniforms.aspectScale, 0.001) * 0.5 + 0.5, 0.0, 1.0);

let farFade = mix(0.48, 0.98, pow(depth, 1.08));

let hazeFade = mix(0.86, 1.0, vertical);

let alpha = clamp(farFade * hazeFade * (0.84 + birdNoise * 0.18), 0.38, 0.98);

let sky = skyColor(correctedPosition);

let ink = mix(vec3f(0.010, 0.011, 0.014), vec3f(0.058, 0.052, 0.058), 1.0 - vertical);

let atmosphericInk = mix(sky * 0.22, ink, alpha);

output.birdColor = vec4f(atmosphericInk, alpha);

return output;

}



@fragment

fn fragmentMain(

@location(0) part: f32,

@location(1) screenPosition: vec2f,

@location(2) birdColor: vec4f

) -> @location(0) vec4f {

if (part < 0.5) {

return vec4f(skyColor(screenPosition), 1.0);

}

return birdColor;

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

let ribbonT = birdNoise;

let shapeNoise = positionsIn[i].w;

let cycle = fract(seconds * 0.018);

let phase = cycle * 4.0;

let cloudWeightRaw = max(1.0 - abs(phase), 1.0 - abs(phase - 4.0));

let sWeightRaw = max(0.0, 1.0 - abs(phase - 1.0));

let horizontalWeightRaw = max(0.0, 1.0 - abs(phase - 2.0));

let plumeWeightRaw = max(0.0, 1.0 - abs(phase - 3.0));

let cloudWeight = cloudWeightRaw * cloudWeightRaw * (3.0 - 2.0 * cloudWeightRaw);

let sWeight = sWeightRaw * sWeightRaw * (3.0 - 2.0 * sWeightRaw);

let horizontalWeight = horizontalWeightRaw * horizontalWeightRaw * (3.0 - 2.0 * horizontalWeightRaw);

let plumeWeight = plumeWeightRaw * plumeWeightRaw * (3.0 - 2.0 * plumeWeightRaw);

let sHold = smoothstep(0.18, 0.30, cycle) * (1.0 - smoothstep(0.48, 0.62, cycle));

let cloudWeightFinal = cloudWeight * (1.0 - sHold);

let sWeightFinal = max(sWeight, sHold * 3.2);

let horizontalWeightFinal = horizontalWeight * (1.0 - sHold);

let plumeWeightFinal = plumeWeight * (1.0 - sHold);

let weightSum = max(cloudWeightFinal + sWeightFinal + horizontalWeightFinal + plumeWeightFinal, 0.001);

let cloudAngle = birdNoise * 6.28318;

let cloudRadius = pow(shapeNoise, 0.58);

let cloudCenter = vec2f(

cos(cloudAngle) * 0.38 * cloudRadius + sin(shapeNoise * 6.28318 + seconds * 0.10) * 0.04,

(sin(cloudAngle) * 0.25 * cloudRadius + 0.24 + sin(seconds * 0.07) * 0.08) * uniforms.aspectScale

);

let cloudTangent = normalize(vec2f(-sin(cloudAngle) * 0.38, cos(cloudAngle) * 0.25 * uniforms.aspectScale));

let sFrequency = 2.16 + sin(seconds * 0.045) * 0.12;

let sPhase = -0.16 + sin(seconds * 0.070) * 0.07;

let sAmplitude = 0.31 + sin(seconds * 0.038) * 0.035;

let sAngle = (ribbonT * sFrequency + sPhase) * 6.28318;

let sSecondary = (ribbonT * 4.05 + 0.42 - seconds * 0.035) * 6.28318;

let sCenter = vec2f(

sin(sAngle) * sAmplitude + sin(sSecondary) * 0.035,

(0.74 - ribbonT * 1.38 + sin((ribbonT * 2.1 - seconds * 0.060) * 6.28318) * 0.025) * uniforms.aspectScale

);

let sTangent = normalize(vec2f(

cos(sAngle) * sFrequency * 6.28318 * sAmplitude + cos(sSecondary) * 4.05 * 6.28318 * 0.035,

(-1.38 + cos((ribbonT * 2.1 - seconds * 0.060) * 6.28318) * 2.1 * 6.28318 * 0.025) * uniforms.aspectScale

));

let horizontalAngle = (ribbonT * 1.18 + sin(seconds * 0.06) * 0.07) * 6.28318;

let horizontalCenter = vec2f(

mix(-0.78, 0.78, ribbonT),

(0.12 + sin(horizontalAngle) * 0.20 + sin((ribbonT * 3.7 + seconds * 0.04) * 6.28318) * 0.045) * uniforms.aspectScale

);

let horizontalTangent = normalize(vec2f(

1.56,

(cos(horizontalAngle) * 1.18 * 6.28318 * 0.20 + cos((ribbonT * 3.7 + seconds * 0.04) * 6.28318) * 3.7 * 6.28318 * 0.045) * uniforms.aspectScale

));

let plumeAngle = (ribbonT * 1.58 + seconds * 0.035) * 6.28318;

let plumeCenter = vec2f(

sin(plumeAngle) * 0.24 + (ribbonT - 0.5) * 0.16,

(0.70 - ribbonT * 1.32 + sin((ribbonT * 3.2 - seconds * 0.045) * 6.28318) * 0.065) * uniforms.aspectScale

);

let plumeTangent = normalize(vec2f(

cos(plumeAngle) * 1.58 * 6.28318 * 0.24 + 0.16,

(-1.32 + cos((ribbonT * 3.2 - seconds * 0.045) * 6.28318) * 3.2 * 6.28318 * 0.065) * uniforms.aspectScale

));

let globalDrift = vec2f(

sin(seconds * 0.085) * 0.22 + sin(seconds * 0.031) * 0.10,

cos(seconds * 0.064) * uniforms.aspectScale * 0.045

);

let ribbonCenter = (

cloudCenter * cloudWeightFinal +
sCenter * sWeightFinal +
horizontalCenter * horizontalWeightFinal +
plumeCenter * plumeWeightFinal

) / weightSum + globalDrift;

let ribbonTangent = normalize((

cloudTangent * cloudWeightFinal +
sTangent * sWeightFinal +
horizontalTangent * horizontalWeightFinal +
plumeTangent * plumeWeightFinal

) / weightSum);

let ribbonNormalTarget = vec2f(-ribbonTangent.y, ribbonTangent.x);

let coreBias = pow(abs(fract(birdNoise * 17.0) - 0.5) * 2.0, 2.25);

let laneSide = select(-1.0, 1.0, fract(birdNoise * 29.0) > 0.5);

let compression = 0.72 + 0.28 * sin(seconds * 0.95 - ribbonT * 10.5);

let laneBase = (

0.15 * cloudWeightFinal +
0.052 * sWeightFinal +
0.070 * horizontalWeightFinal +
0.075 * plumeWeightFinal

) / weightSum;

let lane = laneSide * coreBias * (laneBase + 0.025 * sin(ribbonT * 6.28318) * sin(ribbonT * 6.28318)) * compression;

let showTarget = ribbonCenter + ribbonNormalTarget * lane;

let toTarget = showTarget - position;

let distanceToTarget = max(length(toTarget), 0.001);

let targetDirection = toTarget / distanceToTarget;

let tangent = vec2f(-targetDirection.y, targetDirection.x);

let gatherPulse = 0.5 + 0.5 * sin(seconds * 0.21);

let holdPulse = smoothstep(0.62, 0.96, sin(seconds * 0.11) * 0.5 + 0.5);

let birdSide = select(-1.0, 1.0, birdNoise > 0.5);

let flockInfluence = 1.0 - uniforms.effect.x;



velocity += targetDirection * (0.30 + gatherPulse * 0.16 + holdPulse * 0.34) * flockInfluence * uniforms.deltaTime;

velocity += tangent * birdSide * (0.12 + (1.0 - gatherPulse) * 0.18 - holdPulse * 0.08) * flockInfluence * uniforms.deltaTime;



if (uniforms.effect.x > 0.5) {

let formationTarget = formationTargets[i].xy;

let toFormation = formationTarget - position;

let distanceToFormation = max(length(toFormation), 0.001);

velocity += (toFormation / distanceToFormation) * min(distanceToFormation, 0.75) * 7.0 * uniforms.deltaTime;

velocity *= 1.0 - 4.2 * uniforms.deltaTime;

}



let ribbonDistance = dot(position - ribbonCenter, ribbonNormalTarget);

let ribbonThickness = (laneBase * 0.92 + 0.028 * sin(ribbonT * 6.28318) * sin(ribbonT * 6.28318)) * (0.88 + 0.22 * compression);

let ribbonEdge = max(abs(ribbonDistance) - ribbonThickness, 0.0);

let ribbonSide = select(-1.0, 1.0, ribbonDistance >= 0.0);

velocity -= ribbonNormalTarget * ribbonSide * ribbonEdge * (1.20 + holdPulse * 0.80) * flockInfluence * uniforms.deltaTime;

velocity += ribbonTangent * (0.08 + 0.06 * sin(seconds * 0.17 + birdNoise * 6.28318)) * flockInfluence * uniforms.deltaTime;

let targetPull = showTarget - position;

velocity += targetPull * (0.28 + holdPulse * 0.24) * flockInfluence * uniforms.deltaTime;



let flow = vec2f(

sin(position.y * 1.8 + seconds * 0.72 + birdNoise * 6.28318),

cos(position.x * 2.4 - seconds * 0.61 + birdNoise * 3.14159)

) * 0.052;

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
