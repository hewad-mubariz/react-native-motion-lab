export interface FurnitureProduct {
  id: string;
  name: string;
  material: string;
  model: number;
}

export const FURNITURE_PRODUCTS: FurnitureProduct[] = [
  {
    id: "gallinera-table",
    name: "Gallinera Table",
    material: "Wood table",
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model: require("../../assets/models/gallinera_table_4k.glb"),
  },
  {
    id: "metal-office-desk",
    name: "Office Desk",
    material: "Metal / work surface",
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model: require("../../assets/models/metal_office_desk_4k.glb"),
  },
  {
    id: "mid-century-chair",
    name: "Lounge Chair",
    material: "Fabric / walnut",
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model: require("../../assets/models/mid_century_lounge_chair_4k.glb"),
  },
  {
    id: "sofa-02",
    name: "Sofa 02",
    material: "Upholstered sofa",
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model: require("../../assets/models/sofa_02_4k.glb"),
  },
  {
    id: "accent-chair",
    name: "Accent Chair",
    material: "Fabric / wood",
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model: require("../../assets/models/SheenChair.glb"),
  },
];
