// Couche d'unités centralisée. Tout est calculé en SI ; la conversion ne se fait
// qu'aux frontières (saisie / affichage). valeur_SI = valeur × factor + offset.

export type Dimension =
  | 'power' | 'energy' | 'temperature' | 'temperatureDelta'
  | 'massFlow' | 'volFlow' | 'density' | 'specificHeat'
  | 'pressure' | 'length' | 'area' | 'velocity' | 'time'
  | 'ratio' | 'heatTransfer' | 'conductivity' | 'cost';

export type UnitDef = { factor: number; offset?: number };
type DimDef = { si: string; display: string; units: Record<string, UnitDef> };

export const DIMENSIONS: Record<Dimension, DimDef> = {
  power: { si: 'W', display: 'kW', units: { W: { factor: 1 }, kW: { factor: 1e3 }, MW: { factor: 1e6 } } },
  energy: {
    si: 'J', display: 'kWh',
    units: {
      J: { factor: 1 }, kJ: { factor: 1e3 }, MJ: { factor: 1e6 }, GJ: { factor: 1e9 },
      kWh: { factor: 3.6e6 }, MWh: { factor: 3.6e9 },
      // 1 tep = 41,868 GJ : convention internationale (10^7 kcal_IT, 1 kcal_IT = 4,1868 kJ).
      tep: { factor: 4.1868e10 },
      // 1 thermie = 1 Mcal. TODO: source à vérifier (4,1855 MJ si calorie à 15 °C ; 4,1868 MJ si calorie IT).
      th: { factor: 4.1855e6 },
    },
  },
  temperature: { si: 'K', display: '°C', units: { '°C': { factor: 1, offset: 273.15 }, K: { factor: 1 } } },
  // Un écart de température s'exprime indifféremment en K ou en °C.
  temperatureDelta: { si: 'K', display: 'K', units: { K: { factor: 1 }, '°C': { factor: 1 } } },
  massFlow: { si: 'kg/s', display: 'kg/s', units: { 'kg/s': { factor: 1 }, 'kg/h': { factor: 1 / 3600 }, 't/h': { factor: 1000 / 3600 } } },
  volFlow: {
    si: 'm³/s', display: 'm³/h',
    units: { 'm³/s': { factor: 1 }, 'm³/h': { factor: 1 / 3600 }, 'L/s': { factor: 1e-3 }, 'L/min': { factor: 1e-3 / 60 } },
  },
  density: { si: 'kg/m³', display: 'kg/m³', units: { 'kg/m³': { factor: 1 } } },
  specificHeat: { si: 'J/(kg·K)', display: 'kJ/(kg·K)', units: { 'J/(kg·K)': { factor: 1 }, 'kJ/(kg·K)': { factor: 1e3 } } },
  pressure: { si: 'Pa', display: 'bar', units: { Pa: { factor: 1 }, kPa: { factor: 1e3 }, mbar: { factor: 1e2 }, bar: { factor: 1e5 }, MPa: { factor: 1e6 } } },
  length: { si: 'm', display: 'm', units: { m: { factor: 1 }, mm: { factor: 1e-3 }, cm: { factor: 1e-2 } } },
  area: { si: 'm²', display: 'm²', units: { 'm²': { factor: 1 }, 'cm²': { factor: 1e-4 }, 'mm²': { factor: 1e-6 } } },
  velocity: { si: 'm/s', display: 'm/s', units: { 'm/s': { factor: 1 }, 'km/h': { factor: 1 / 3.6 } } },
  time: { si: 's', display: 'h', units: { s: { factor: 1 }, min: { factor: 60 }, h: { factor: 3600 } } },
  ratio: { si: '-', display: '-', units: { '-': { factor: 1 }, '%': { factor: 0.01 } } },
  heatTransfer: { si: 'W/(m²·K)', display: 'W/(m²·K)', units: { 'W/(m²·K)': { factor: 1 } } },
  conductivity: { si: 'W/(m·K)', display: 'W/(m·K)', units: { 'W/(m·K)': { factor: 1 } } },
  cost: { si: '€', display: '€', units: { '€': { factor: 1 }, 'k€': { factor: 1e3 } } },
};

export function unitsOf(d: Dimension): string[] {
  return Object.keys(DIMENSIONS[d].units);
}

function def(d: Dimension, unit: string): UnitDef {
  const u = DIMENSIONS[d].units[unit];
  if (!u) throw new Error(`Unité inconnue « ${unit} » pour la dimension ${d}`);
  return u;
}

export function toSI(value: number, d: Dimension, unit: string): number {
  const u = def(d, unit);
  return value * u.factor + (u.offset ?? 0);
}

export function fromSI(value: number, d: Dimension, unit: string): number {
  const u = def(d, unit);
  return (value - (u.offset ?? 0)) / u.factor;
}
