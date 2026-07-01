export interface LoadedGlbPrimitive {
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
  indexFormat: GPUIndexFormat;
  materialIndex: number;
}

export interface LoadedGlbMaterial {
  baseColorImage?: Uint8Array<ArrayBuffer>;
  baseColorFactor: [number, number, number, number];
  uvOffset: [number, number];
  uvScale: [number, number];
}

export interface LoadedGlbMesh {
  primitives: LoadedGlbPrimitive[];
  materials: LoadedGlbMaterial[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4";
  min?: [number, number, number];
  max?: [number, number, number];
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfTextureInfo {
  index: number;
  extensions?: {
    KHR_texture_transform?: {
      offset?: [number, number];
      scale?: [number, number];
      texCoord?: number;
    };
  };
}

interface GltfPrimitive {
  attributes: {
    POSITION: number;
    NORMAL: number;
    TEXCOORD_0?: number;
  };
  indices: number;
  material?: number;
  mode?: number;
}

interface GltfNode {
  children?: number[];
  matrix?: number[];
  mesh?: number;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
}

interface GltfJson {
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  scenes?: {
    nodes?: number[];
  }[];
  scene?: number;
  nodes?: GltfNode[];
  meshes: {
    primitives: GltfPrimitive[];
  }[];
  materials?: {
    pbrMetallicRoughness?: {
      baseColorFactor?: [number, number, number, number];
      baseColorTexture?: GltfTextureInfo;
    };
  }[];
  textures?: {
    source: number;
  }[];
  images?: {
    bufferView: number;
    mimeType: string;
  }[];
}

type Mat4Tuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const IDENTITY: Mat4Tuple = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5121: 1,
  5123: 2,
  5125: 4,
  5126: 4,
};

const COMPONENTS_PER_TYPE: Record<GltfAccessor["type"], number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const readComponent = (
  view: DataView,
  byteOffset: number,
  componentType: number,
) => {
  switch (componentType) {
    case 5121:
      return view.getUint8(byteOffset);
    case 5123:
      return view.getUint16(byteOffset, true);
    case 5125:
      return view.getUint32(byteOffset, true);
    case 5126:
      return view.getFloat32(byteOffset, true);
    default:
      throw new Error(`Unsupported glTF component type ${componentType}`);
  }
};

const accessorValue = (
  gltf: GltfJson,
  dataView: DataView,
  accessorIndex: number,
  index: number,
  component: number,
) => {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const componentCount = COMPONENTS_PER_TYPE[accessor.type];
  const componentByteSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const stride = bufferView.byteStride ?? componentCount * componentByteSize;
  const byteOffset =
    (bufferView.byteOffset ?? 0) +
    (accessor.byteOffset ?? 0) +
    index * stride +
    component * componentByteSize;

  return readComponent(dataView, byteOffset, accessor.componentType);
};

const readIndices = (
  gltf: GltfJson,
  bin: ArrayBuffer,
  accessorIndex: number,
) => {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  if (accessor.componentType === 5123) {
    return {
      indices: new Uint16Array(bin, byteOffset, accessor.count),
      indexFormat: "uint16" as const,
    };
  }

  if (accessor.componentType === 5125) {
    return {
      indices: new Uint32Array(bin, byteOffset, accessor.count),
      indexFormat: "uint32" as const,
    };
  }

  throw new Error(`Unsupported glTF index type ${accessor.componentType}`);
};

const multiplyMat4 = (a: Mat4Tuple, b: Mat4Tuple): Mat4Tuple => {
  const out = new Array(16).fill(0) as Mat4Tuple;

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }

  return out;
};

const nodeMatrix = (node: GltfNode): Mat4Tuple => {
  if (node.matrix) {
    return node.matrix as Mat4Tuple;
  }

  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
};

const transformPosition = (m: Mat4Tuple, x: number, y: number, z: number) => {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ] as const;
};

const transformNormal = (m: Mat4Tuple, x: number, y: number, z: number) => {
  const nx = m[0] * x + m[4] * y + m[8] * z;
  const ny = m[1] * x + m[5] * y + m[9] * z;
  const nz = m[2] * x + m[6] * y + m[10] * z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len] as const;
};

const makePrimitive = (
  gltf: GltfJson,
  bin: ArrayBuffer,
  dataView: DataView,
  primitive: GltfPrimitive,
  worldMatrix: Mat4Tuple,
  materials: LoadedGlbMaterial[],
  bounds: LoadedGlbMesh["bounds"],
): LoadedGlbPrimitive => {
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    throw new Error("Only triangle-list GLB primitives are supported");
  }

  const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
  const vertexCount = positionAccessor.count;
  const vertices = new Float32Array(vertexCount * 11);
  const material = materials[primitive.material ?? 0] ?? materials[0];

  for (let i = 0; i < vertexCount; i++) {
    const dst = i * 11;
    const px = accessorValue(gltf, dataView, primitive.attributes.POSITION, i, 0);
    const py = accessorValue(gltf, dataView, primitive.attributes.POSITION, i, 1);
    const pz = accessorValue(gltf, dataView, primitive.attributes.POSITION, i, 2);
    const nx = accessorValue(gltf, dataView, primitive.attributes.NORMAL, i, 0);
    const ny = accessorValue(gltf, dataView, primitive.attributes.NORMAL, i, 1);
    const nz = accessorValue(gltf, dataView, primitive.attributes.NORMAL, i, 2);
    const [tx, ty, tz] = transformPosition(worldMatrix, px, py, pz);
    const [tnx, tny, tnz] = transformNormal(worldMatrix, nx, ny, nz);

    vertices[dst] = tx;
    vertices[dst + 1] = ty;
    vertices[dst + 2] = tz;
    vertices[dst + 3] = tnx;
    vertices[dst + 4] = tny;
    vertices[dst + 5] = tnz;
    const u =
      primitive.attributes.TEXCOORD_0 === undefined
        ? 0
        : accessorValue(gltf, dataView, primitive.attributes.TEXCOORD_0, i, 0);
    const v =
      primitive.attributes.TEXCOORD_0 === undefined
        ? 0
        : accessorValue(gltf, dataView, primitive.attributes.TEXCOORD_0, i, 1);
    vertices[dst + 6] = u * material.uvScale[0] + material.uvOffset[0];
    vertices[dst + 7] = v * material.uvScale[1] + material.uvOffset[1];
    vertices[dst + 8] = material.baseColorFactor[0];
    vertices[dst + 9] = material.baseColorFactor[1];
    vertices[dst + 10] = material.baseColorFactor[2];

    bounds.min[0] = Math.min(bounds.min[0], tx);
    bounds.min[1] = Math.min(bounds.min[1], ty);
    bounds.min[2] = Math.min(bounds.min[2], tz);
    bounds.max[0] = Math.max(bounds.max[0], tx);
    bounds.max[1] = Math.max(bounds.max[1], ty);
    bounds.max[2] = Math.max(bounds.max[2], tz);
  }

  const { indices, indexFormat } = readIndices(gltf, bin, primitive.indices);

  return {
    vertices,
    indices,
    indexFormat,
    materialIndex: primitive.material ?? 0,
  };
};

const getImageBytes = (gltf: GltfJson, bin: ArrayBuffer, imageIndex: number) => {
  const image = gltf.images?.[imageIndex];
  if (!image) return undefined;

  const bufferView = gltf.bufferViews[image.bufferView];
  const start = bufferView.byteOffset ?? 0;
  return new Uint8Array(bin.slice(start, start + bufferView.byteLength));
};

const modelCache = new Map<string, Promise<LoadedGlbMesh>>();

const makeMaterials = (gltf: GltfJson, bin: ArrayBuffer) => {
  const materials = gltf.materials ?? [];

  const loadedMaterials = materials.map((material): LoadedGlbMaterial => {
    const pbr = material.pbrMetallicRoughness;
    const textureInfo = pbr?.baseColorTexture;
    const texture = textureInfo
      ? gltf.textures?.[textureInfo.index]
      : undefined;
    const imageBytes =
      texture?.source === undefined
        ? undefined
        : getImageBytes(gltf, bin, texture.source);
    const transform = textureInfo?.extensions?.KHR_texture_transform;

    return {
      baseColorImage: imageBytes,
      baseColorFactor: pbr?.baseColorFactor ?? [1, 1, 1, 1],
      uvOffset: transform?.offset ?? [0, 0],
      uvScale: transform?.scale ?? [1, 1],
    };
  });

  return loadedMaterials.length > 0
    ? loadedMaterials
    : ([
        {
          baseColorFactor: [1, 1, 1, 1],
          uvOffset: [0, 0],
          uvScale: [1, 1],
        },
      ] satisfies LoadedGlbMaterial[]);
};

const parseGlbMesh = async (uri: string): Promise<LoadedGlbMesh> => {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to load GLB: ${response.status}`);
  }

  const glb = await response.arrayBuffer();
  const header = new DataView(glb, 0, 12);
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);

  if (magic !== 0x46546c67 || version !== 2) {
    throw new Error("Unsupported GLB file");
  }

  const jsonLength = new DataView(glb, 12, 4).getUint32(0, true);
  const jsonChunkType = new TextDecoder().decode(new Uint8Array(glb, 16, 4));
  if (jsonChunkType !== "JSON") {
    throw new Error("GLB is missing a JSON chunk");
  }

  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)),
  ) as GltfJson;

  const binHeaderOffset = 20 + jsonLength;
  const binLength = new DataView(glb, binHeaderOffset, 4).getUint32(0, true);
  const binStart = binHeaderOffset + 8;
  const bin = glb.slice(binStart, binStart + binLength);
  const dataView = new DataView(bin);
  const materials = makeMaterials(json, bin);
  const bounds: LoadedGlbMesh["bounds"] = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const primitives: LoadedGlbPrimitive[] = [];

  const visitNode = (nodeIndex: number, parentMatrix: Mat4Tuple) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;

    const worldMatrix = multiplyMat4(parentMatrix, nodeMatrix(node));

    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        primitives.push(
          makePrimitive(
            json,
            bin,
            dataView,
            primitive,
            worldMatrix,
            materials,
            bounds,
          ),
        );
      }
    }

    for (const child of node.children ?? []) {
      visitNode(child, worldMatrix);
    }
  };

  const scene = json.scenes?.[json.scene ?? 0];
  const rootNodes =
    scene?.nodes ?? json.nodes?.map((_, nodeIndex) => nodeIndex) ?? [];

  for (const nodeIndex of rootNodes) {
    visitNode(nodeIndex, IDENTITY);
  }

  if (primitives.length === 0) {
    throw new Error("GLB contains no drawable mesh primitives");
  }

  return {
    primitives,
    materials,
    bounds,
  };
};

export const loadGlbMesh = (uri: string): Promise<LoadedGlbMesh> => {
  const cached = modelCache.get(uri);
  if (cached) {
    return cached;
  }

  const promise = parseGlbMesh(uri).catch((error) => {
    modelCache.delete(uri);
    throw error;
  });
  modelCache.set(uri, promise);
  return promise;
};

export const preloadGlbMesh = (uri: string) => {
  void loadGlbMesh(uri);
};
