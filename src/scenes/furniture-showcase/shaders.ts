export const furnitureWGSL = /* wgsl */ `
struct Globals {
  viewProj: mat4x4f,
  cameraPos: vec4f,
  lightDir: vec4f,
  params: vec4f,
};

@group(0) @binding(0) var<uniform> globals: Globals;

struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec3f,
};

struct VertexOut {
  @builtin(position) clipPosition: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec3f,
};

@group(0) @binding(1) var baseColorSampler: sampler;
@group(0) @binding(2) var baseColorTexture: texture_2d<f32>;

@vertex
fn vertexMain(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  out.clipPosition = globals.viewProj * vec4f(input.position, 1.0);
  out.worldPosition = input.position;
  out.normal = normalize(input.normal);
  out.uv = input.uv;
  out.color = input.color;
  return out;
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  let n = normalize(input.normal);
  let l = normalize(-globals.lightDir.xyz);
  let v = normalize(globals.cameraPos.xyz - input.worldPosition);
  let h = normalize(l + v);

  let diffuse = max(dot(n, l), 0.0);
  let specular = pow(max(dot(n, h), 0.0), 48.0) * 0.05;

  let textureColor = textureSample(baseColorTexture, baseColorSampler, input.uv).rgb;
  let base = textureColor * input.color * (0.34 + diffuse * 0.78);
  let color = base + vec3f(specular);

  return vec4f(pow(color, vec3f(1.0 / 2.2)), 1.0);
}
`;
