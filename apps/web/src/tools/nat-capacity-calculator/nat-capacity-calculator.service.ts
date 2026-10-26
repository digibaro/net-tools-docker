export interface NatInput { subscribers: number, sessionsPerSubscriber: number, publicIps: number, portLow: number, portHigh: number, blockSize: number }
export interface NatResult {
  portsPerIp: number
  totalPorts: number
  needed: number
  /** Subscribers per public IP at the given block size (port-block / deterministic NAT). */
  subscribersPerIp: number
  maxSubscribers: number
  ipsNeeded: number
  utilisation: number
  fits: boolean
}

export function natCapacity(i: NatInput): NatResult {
  const portsPerIp = Math.max(0, i.portHigh - i.portLow + 1)
  const totalPorts = portsPerIp * i.publicIps
  const needed = i.subscribers * i.sessionsPerSubscriber
  const block = Math.max(1, i.blockSize)
  const subscribersPerIp = Math.floor(portsPerIp / block)
  const maxSubscribers = subscribersPerIp * i.publicIps
  const ipsNeeded = subscribersPerIp ? Math.ceil(i.subscribers / subscribersPerIp) : Infinity
  return { portsPerIp, totalPorts, needed, subscribersPerIp, maxSubscribers, ipsNeeded, utilisation: totalPorts ? needed / totalPorts * 100 : 0, fits: i.subscribers <= maxSubscribers && needed <= totalPorts }
}

/** Deterministic NAT (RFC 7422): subscriber n gets port range [low + n·block, low + (n+1)·block − 1] on IP n div perIp. */
export function deterministic(i: NatInput, n: number): { ip: number, from: number, to: number } | undefined {
  const r = natCapacity(i)
  if (n < 0 || n >= r.maxSubscribers)
    return undefined
  const slot = n % r.subscribersPerIp
  return { ip: Math.floor(n / r.subscribersPerIp), from: i.portLow + slot * i.blockSize, to: i.portLow + (slot + 1) * i.blockSize - 1 }
}
