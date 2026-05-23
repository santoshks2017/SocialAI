export interface OemImage {
  angle: 'front_exterior' | 'rear_exterior' | 'side_exterior' | 'interior_dashboard';
  url: string;
}

export interface OemColor {
  name: string;
  hex: string;
  images: OemImage[];
}

export interface OemModel {
  brand: string;
  model_name: string;
  canonical_id: string;
  alias_names: string[];
  variants: string[];
  colours: OemColor[];
  images: OemImage[];
}

export const CARDEKHO_OEM_DATABASE: OemModel[] = [
  {
    brand: "Maruti Suzuki",
    model_name: "Swift",
    canonical_id: "maruti_swift",
    alias_names: ["swift", "maruti swift", "swift 2024", "suzuki swift"],
    variants: ["LXI", "VXI", "ZXI", "ZXI+"],
    colours: [
      {
        name: "Luster Blue",
        hex: "#1A5276",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      },
      {
        name: "Solid Fire Red",
        hex: "#C0392B",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" },
      { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
      { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
      { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Hyundai",
    model_name: "Creta",
    canonical_id: "hyundai_creta",
    alias_names: ["creta", "hyundai creta", "creta 2024", "creta n line"],
    variants: ["E", "EX", "S", "SX", "SX(O)"],
    colours: [
      {
        name: "Abyss Black",
        hex: "#111111",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      },
      {
        name: "Atlas White",
        hex: "#F5EEF8",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" },
      { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
      { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
      { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Tata",
    model_name: "Nexon",
    canonical_id: "tata_nexon",
    alias_names: ["nexon", "tata nexon", "nexon ev", "nexon 2024"],
    variants: ["Smart", "Pure", "Creative", "Fearless"],
    colours: [
      {
        name: "Flame Red",
        hex: "#E74C3C",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" },
      { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
      { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
      { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Mahindra",
    model_name: "Thar",
    canonical_id: "mahindra_thar",
    alias_names: ["thar", "mahindra thar", "thar roxx", "thar 4x4"],
    variants: ["AX Opt", "LX", "Earth Edition"],
    colours: [
      {
        name: "Rocky Beige",
        hex: "#A0522D",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
          { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
          { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
      { angle: "rear_exterior", url: "https://images.unsplash.com/photo-1562591176-c290d70b6d27?auto=format&fit=crop&w=800&q=80" },
      { angle: "side_exterior", url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80" },
      { angle: "interior_dashboard", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Honda",
    model_name: "City",
    canonical_id: "honda_city",
    alias_names: ["city", "honda city", "city hybrid", "city 2024"],
    variants: ["SV", "V", "VX", "ZX"],
    colours: [
      {
        name: "Radiant Red Metallic",
        hex: "#B03A2E",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Toyota",
    model_name: "Fortuner",
    canonical_id: "toyota_fortuner",
    alias_names: ["fortuner", "toyota fortuner", "fortuner legender"],
    variants: ["Standard", "Legender", "GR Sport"],
    colours: [
      {
        name: "Super White",
        hex: "#FFFFFF",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Kia",
    model_name: "Seltos",
    canonical_id: "kia_seltos",
    alias_names: ["seltos", "kia seltos", "seltos 2024"],
    variants: ["HTE", "HTK", "HTX", "GTX+", "X-Line"],
    colours: [
      {
        name: "Pewter Olive",
        hex: "#556B2F",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "MG",
    model_name: "Hector",
    canonical_id: "mg_hector",
    alias_names: ["hector", "mg hector", "hector plus"],
    variants: ["Style", "Shine", "Smart", "Sharp Pro", "Savvy Pro"],
    colours: [
      {
        name: "Glaze Red",
        hex: "#A93226",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Renault",
    model_name: "Kiger",
    canonical_id: "renault_kiger",
    alias_names: ["kiger", "renault kiger"],
    variants: ["RXE", "RXL", "RXT", "RXZ"],
    colours: [
      {
        name: "Caspian Blue",
        hex: "#2E4053",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Volkswagen",
    model_name: "Taigun",
    canonical_id: "vw_taigun",
    alias_names: ["taigun", "volkswagen taigun", "vw taigun"],
    variants: ["Comfortline", "Highline", "Topline", "GT Plus"],
    colours: [
      {
        name: "Wild Cherry Red",
        hex: "#900C3F",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Skoda",
    model_name: "Kushaq",
    canonical_id: "skoda_kushaq",
    alias_names: ["kushaq", "skoda kushaq"],
    variants: ["Active", "Ambition", "Style", "Monte Carlo"],
    colours: [
      {
        name: "Honey Orange",
        hex: "#E67E22",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Jeep",
    model_name: "Compass",
    canonical_id: "jeep_compass",
    alias_names: ["compass", "jeep compass"],
    variants: ["Sport", "Longitude", "Limited", "Model S"],
    colours: [
      {
        name: "Exotica Red",
        hex: "#E74C3C",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Citroën",
    model_name: "C3",
    canonical_id: "citroen_c3",
    alias_names: ["c3", "citroen c3"],
    variants: ["Live", "Feel", "Shine"],
    colours: [
      {
        name: "Zesty Orange",
        hex: "#FF5733",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "BMW",
    model_name: "X1",
    canonical_id: "bmw_x1",
    alias_names: ["x1", "bmw x1"],
    variants: ["sDrive18i M Sport", "sDrive18d M Sport"],
    colours: [
      {
        name: "Phytonic Blue",
        hex: "#2471A3",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Mercedes-Benz",
    model_name: "C-Class",
    canonical_id: "mercedes_c_class",
    alias_names: ["c class", "mercedes c class", "c-class", "c200"],
    variants: ["C200", "C220d", "C300d M Sport"],
    colours: [
      {
        name: "Obsidian Black",
        hex: "#1C2833",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Audi",
    model_name: "A4",
    canonical_id: "audi_a4",
    alias_names: ["a4", "audi a4", "a4 technology"],
    variants: ["Premium", "Premium Plus", "Technology"],
    colours: [
      {
        name: "Navarra Blue",
        hex: "#1B4F72",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Ford",
    model_name: "Mustang",
    canonical_id: "ford_mustang",
    alias_names: ["mustang", "ford mustang", "mustang gt"],
    variants: ["GT Fastback"],
    colours: [
      {
        name: "Race Red",
        hex: "#FF0000",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=800&q=80" }
    ]
  },
  {
    brand: "Nissan",
    model_name: "Magnite",
    canonical_id: "nissan_magnite",
    alias_names: ["magnite", "nissan magnite"],
    variants: ["XE", "XL", "XV", "XV Premium"],
    colours: [
      {
        name: "Flare Garnet Red",
        hex: "#78281F",
        images: [
          { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" }
        ]
      }
    ],
    images: [
      { angle: "front_exterior", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80" }
    ]
  }
];
