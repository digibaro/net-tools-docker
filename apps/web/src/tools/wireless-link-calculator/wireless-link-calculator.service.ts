export interface LinkInput { freqGHz: number, distanceKm: number, txDbm: number, txGainDbi: number, rxGainDbi: number, cableLossDb: number, sensitivityDbm: number }
export interface LinkResult { fsplDb: number, eirpDbm: number, rxDbm: number, marginDb: number, fresnelM: number, clearanceM: number, bulgeM: number, mastM: number }

/** Free-space path loss in dB (d in km, f in MHz): 20·log10(d) + 20·log10(f) + 32.44. */
export const fspl = (km: number, ghz: number) => 20 * Math.log10(km) + 20 * Math.log10(ghz * 1000) + 32.44

/** Radius of the first Fresnel zone at the middle of the path, in metres. */
export const fresnelMid = (km: number, ghz: number) => 8.657 * Math.sqrt(km / ghz)

/** Earth bulge at mid-path in metres for refraction factor k (4/3 = standard atmosphere). */
export const bulge = (km: number, k = 4 / 3) => (km * km * 1000) / (8 * k * 6371)

export function link(i: LinkInput): LinkResult {
  const r = (n: number) => Math.round(n * 10) / 10
  const loss = fspl(i.distanceKm, i.freqGHz)
  const eirp = i.txDbm + i.txGainDbi - i.cableLossDb
  const rx = eirp - loss + i.rxGainDbi - i.cableLossDb
  const f = fresnelMid(i.distanceKm, i.freqGHz)
  const b = bulge(i.distanceKm)
  return { fsplDb: r(loss), eirpDbm: r(eirp), rxDbm: r(rx), marginDb: r(rx - i.sensitivityDbm), fresnelM: r(f), clearanceM: r(0.6 * f), bulgeM: r(b), mastM: r(0.6 * f + b) }
}
