/**
 * Runs at most `n` of the wrapped calls at once (the api allows CONCURRENCY_PER_IP = 3 running
 * jobs per client and answers BUSY beyond that, so composed reports must not fire everything at
 * once). Calls start in the order they were made.
 */
export function limiter(n: number) {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (active < n)
      queue.shift()?.()
  }
  return <T>(fn: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    queue.push(() => {
      active++
      fn().then(resolve, reject).finally(() => {
        active--
        next()
      })
    })
    next()
  })
}
