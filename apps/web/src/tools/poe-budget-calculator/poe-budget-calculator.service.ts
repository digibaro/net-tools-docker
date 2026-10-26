/** IEEE 802.3 PoE classes: power at the PSE (switch port) and guaranteed at the PD (device), in watts. */
export const CLASSES = [
  { id: '0', standard: '802.3af (PoE)', pse: 15.4, pd: 13 },
  { id: '1', standard: '802.3af (PoE)', pse: 4, pd: 3.84 },
  { id: '2', standard: '802.3af (PoE)', pse: 7, pd: 6.49 },
  { id: '3', standard: '802.3af (PoE)', pse: 15.4, pd: 13 },
  { id: '4', standard: '802.3at (PoE+)', pse: 30, pd: 25.5 },
  { id: '5', standard: '802.3bt Type 3 (PoE++)', pse: 45, pd: 40 },
  { id: '6', standard: '802.3bt Type 3 (PoE++)', pse: 60, pd: 51 },
  { id: '7', standard: '802.3bt Type 4 (PoE++)', pse: 75, pd: 62 },
  { id: '8', standard: '802.3bt Type 4 (PoE++)', pse: 90, pd: 71.3 },
] as const
export type ClassId = typeof CLASSES[number]['id']

export interface Device { name: string, cls: ClassId, count: number, watts?: number }
export interface Budget { allocated: number, drawn: number, remaining: number, pct: number, ports: number, over: boolean }

/** Switches reserve the class maximum per port (class-based) or the measured draw (LLDP-based). */
export function budget(devices: Device[], available: number, mode: 'class' | 'lldp'): Budget {
  let allocated = 0
  let drawn = 0
  let ports = 0
  for (const d of devices) {
    const c = CLASSES.find(x => x.id === d.cls)!
    const draw = d.watts && d.watts > 0 ? Math.min(d.watts, c.pd) : c.pd
    allocated += d.count * (mode === 'class' ? c.pse : draw * c.pse / c.pd)
    drawn += d.count * draw
    ports += d.count
  }
  const round = (n: number) => Math.round(n * 10) / 10
  return { allocated: round(allocated), drawn: round(drawn), remaining: round(available - allocated), pct: available ? round(allocated / available * 100) : 0, ports, over: allocated > available }
}

/** "AP, 4, 6" (name, class, count, optional measured watts) per line. */
export function parseDevices(text: string): Device[] {
  return text.split('\n').map(l => l.split(/\s*[,;\t|]\s*/)).filter(p => p[0]?.trim() && CLASSES.some(c => c.id === p[1]?.trim())).map(p => ({ name: p[0]!.trim(), cls: p[1]!.trim() as ClassId, count: Math.max(1, Number.parseInt(p[2] ?? '1', 10) || 1), watts: p[3] ? Number.parseFloat(p[3].replace(',', '.')) : undefined }))
}
