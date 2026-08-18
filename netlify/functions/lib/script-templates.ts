export interface BladeScript {
  name: string
  priceRange: string
  targetCustomers: string
  applications: string[]
  keyFeatures: string[]
  pitchTemplate: string
}

export const scriptTemplates: BladeScript[] = [
  {
    name: "Dark Knight Blade",
    priceRange: "$150 and up",
    targetCustomers: "High-end contractors running handheld or walk-behind saws",
    applications: ["reinforced concrete", "asphalt", "brick", "block", "stone"],
    keyFeatures: [
      "Versatile - cuts almost anything",
      "Diamond segments made under higher heat and lower pressure for maximum longevity without sacrificing speed",
      "Speed tensioned core to eliminate warping and wobbling"
    ],
    pitchTemplate: "I want to tell you about one of my best blades for what you're doing. It's called my 'Dark Knight Blade'. This brand-new blade is designed to work great on a handheld or walk-behind saw. It's versatile enough to cut everything from reinforced concrete to asphalt, brick, block, and stone. Honestly, there is nothing this blade can't cut! The major improvement is the segments are made under higher heat and lower pressure so the diamonds last longer without sacrificing any speed."
  },
  {
    name: "The Spartan Blade",
    priceRange: "$150 and up",
    targetCustomers: "Heavy construction and utility contractors",
    applications: ["reinforced concrete", "asphalt", "ductile iron", "reinforced concrete pipe", "rebar"],
    keyFeatures: [
      "Extreme durability",
      "High heat and lower pressure segment formulation",
      "Laser welded segments for safety"
    ],
    pitchTemplate: "I want to tell you about one of my best blades for what you're doing. It's called my 'Spartan Blade'. It's designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from reinforced concrete, asphalt, ductile iron, reinforced concrete pipe, and even rebar! The major improvement is when they make the diamond segments under higher heat and lower pressure, which makes the diamonds last longer without sacrificing any speed."
  },
  {
    name: "The Warhammer",
    priceRange: "$150 and up",
    targetCustomers: "Heavy-duty contractors cutting metal and concrete",
    applications: ["reinforced concrete", "asphalt", "ductile iron", "reinforced concrete pipe", "rebar"],
    keyFeatures: [
      "Extremely robust bond",
      "High heat and lower pressure segment formulation",
      "Designed for tough jobsites"
    ],
    pitchTemplate: "I want to tell you about one of my best blades for what you're doing. It's called 'The Warhammer'. This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from reinforced concrete, asphalt, ductile iron, reinforced concrete pipe, and even rebar! The major improvement is that they form the diamond segments under higher heat and lower pressure so they last twice as long without sacrificing speed."
  },
  {
    name: "The Titan",
    priceRange: "$150 and up",
    targetCustomers: "Premium contractors wanting the absolute best",
    applications: ["reinforced concrete", "asphalt", "ductile iron", "reinforced concrete pipe", "rebar"],
    keyFeatures: [
      "Flagship blade",
      "High heat and lower pressure segments",
      "Fastest cut and longest life"
    ],
    pitchTemplate: "I want to tell you about one of my best blades for what you're doing. It's called the 'TITAN'. This brand-new blade is designed to work great on a handheld or a walk-behind saw. It's versatile enough to cut everything from reinforced concrete, asphalt, ductile iron, reinforced concrete pipe, and even rebar! The major improvement is when they make the diamond segments under higher heat and lower pressure, which makes the diamonds last longer without sacrificing speed."
  },
  {
    name: "The Medusa Blade",
    priceRange: "$50 to $75",
    targetCustomers: "Masonry, hardscape, and landscape contractors",
    applications: ["cured concrete", "brick", "block", "stone", "pavers"],
    keyFeatures: [
      "12mm jumbo segment (standard is 10mm) for longer blade life",
      "Laser welded segments for reliability and safety",
      "Speed tensioned core to eliminate warping and wobbling",
      "High heat and lower pressure diamond segments"
    ],
    pitchTemplate: "Let me tell you about one of my best selling blades for the kind of work you are doing. It's called 'The Medusa'. What my customers all love about this blade is that it has a 12mm jumbo segment compared to most blades on the market that are just 10mm, giving you longer blade life. It's perfect for cured concrete, brick, block, stone, and pavers. The segments are made under higher heat and lower pressure which makes the diamonds last longer without sacrificing speed. Each segment is laser welded for safety and the core is speed tensioned to eliminate warping and wobbling."
  },
  {
    name: "The King Turbo",
    priceRange: "$75 to $125",
    targetCustomers: "Contractors cutting hard reinforced concrete and hard stone",
    applications: ["hard reinforced concrete", "hard materials", "hard stone"],
    keyFeatures: [
      "24 serrated turbo segments for super fast and smooth cuts",
      "Premium soft bond pulls itself through the cut (no pressure needed on the saw)",
      "High heat and lower pressure diamond segments"
    ],
    pitchTemplate: "Let me tell you about one of my best blades for what you are doing... it's called 'THE KING TURBO BLADE'. What my customers love about this blade is that it has 24 serrated turbo segments which makes the blade cut super fast and smooth through hard reinforced concrete. This premium soft bond blade will actually pull itself through the cut, so you don't have to put a lot of pressure on the saw, you just let the blade do the work for you."
  },
  {
    name: "Titan Razor Blade",
    priceRange: "$40 to $80 (10\" tile blade)",
    targetCustomers: "Tile setters and stone fabricators",
    applications: ["ceramic tile", "marble", "granite", "porcelain"],
    keyFeatures: [
      "10\" specialized tile blade",
      "Cuts through porcelain like a hot knife through butter",
      "Reinforced core prevents warping, wobbling, and walking",
      "Runs super quiet and cuts clean"
    ],
    pitchTemplate: "We have our brand new line of 10\" Razor Blades. It is ideal for cutting ceramic tile, marble, granite, and even porcelain, and it cuts through it like a hot knife through butter! The new 'Razor Blade' has a reinforced core to prevent warping, wobbling, and walking, runs super quiet, and cuts really clean and fast."
  }
]

export const generalStrategies = {
  hook: "With this new release, our manufacturer wants us to give away free blades to our customers to build new relationships.",
  lingo: [
    "like a hot knife through butter",
    "pull itself through the cut",
    "let the blade do the work",
    "made under higher heat and lower pressure",
    "last twice as long without sacrificing speed"
  ]
}
