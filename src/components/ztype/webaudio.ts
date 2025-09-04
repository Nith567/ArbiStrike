// Minimal synthy SFX using WebAudio – no external assets
let ctx: AudioContext | null = null

export function initAudio() {
  if (typeof window === "undefined") return
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === "suspended") ctx.resume()
  } catch {}
}

function blip(freq: number, durMs: number, type: OscillatorType = "square", gain = 0.08) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  g.gain.setValueAtTime(gain, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000)
  osc.connect(g).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durMs / 1000)
}

export function playShoot() {
  initAudio()
  blip(740, 90, "square", 0.06)
}
export function playHit() {
  initAudio()
  blip(220, 180, "sawtooth", 0.07)
}
export function playLose() {
  initAudio()
  blip(440, 120, "triangle", 0.08)
  setTimeout(() => blip(330, 140, "triangle", 0.08), 120)
  setTimeout(() => blip(262, 200, "triangle", 0.08), 260)
}
