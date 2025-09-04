// Tiny WebAudio helper: no external assets, just oscillators.
// Colors/feel: quick 'shoot', 'explode', and a soft 'wrong'.
let ctx: AudioContext | null = null
function ensureCtx() {
  if (typeof window === "undefined") return null
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return ctx
}
function tone(freq: number, durMs: number, type: OscillatorType = "sawtooth", gain = 0.02) {
  const ac = ensureCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  g.gain.value = gain
  osc.frequency.value = freq
  osc.type = type
  osc.connect(g)
  g.connect(ac.destination)
  const now = ac.currentTime
  osc.start(now)
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000)
  osc.stop(now + durMs / 1000 + 0.02)
}

export default function useSfx() {
  return {
    shoot: () => tone(660, 80, "square", 0.04),
    explode: () => {
      tone(220, 60, "sawtooth", 0.05)
      setTimeout(() => tone(160, 70, "triangle", 0.035), 60)
    },
    wrong: () => tone(140, 120, "sine", 0.025),
    lose: () => {
      tone(220, 160, "sawtooth", 0.06)
      setTimeout(() => tone(110, 220, "sine", 0.04), 160)
    },
    bomb: () => {
      // Layer a few low, descending tones for a thumpy explosion
      tone(120, 260, "sawtooth", 0.08)
      setTimeout(() => tone(90, 240, "triangle", 0.07), 80)
      setTimeout(() => tone(70, 220, "sine", 0.06), 160)
    },
  }
}
