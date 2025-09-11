"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSfx from "./webaudio-lite"
import { wordsEasy, wordsMedium, wordsHard } from "./word-bank"
import sdk, { type Context } from "@farcaster/miniapp-sdk"

// Palette (5 colors total): cyan primary, amber accent, and neutrals.
const COLORS = {
  primary: "#22d3ee", // cyan-400/300
  accent: "#f59e0b", // amber-500
  bg: "#000000",
  fg: "#ffffff",
  muted: "rgba(255,255,255,0.65)",
}

type Enemy = {
  id: number
  word: string
  typed: number
  x: number
  y: number
  speed: number
  sprite: number // 1..4
  size: number
}

type PhaseKey = "easy" | "medium" | "hard"

function phaseConfig(elapsedMs: number) {
  // Easy few seconds -> Medium longer -> Hard continues
  // Adjust durations to taste
  const easyMs = 10_000
  const mediumMs = easyMs + 35_000
  if (elapsedMs < easyMs) {
    return { phase: "easy" as PhaseKey, speed: 45, spawnMs: 1200, maxAtOnce: 6, minLen: 3, maxLen: 6 }
  } else if (elapsedMs < mediumMs) {
    return { phase: "medium" as PhaseKey, speed: 70, spawnMs: 850, maxAtOnce: 9, minLen: 4, maxLen: 8 }
  }
  return { phase: "hard" as PhaseKey, speed: 105, spawnMs: 600, maxAtOnce: 12, minLen: 5, maxLen: 10 }
}

function pickWord(phase: PhaseKey) {
  const bank = phase === "easy" ? wordsEasy : phase === "medium" ? wordsMedium : wordsHard
  return bank[Math.floor(Math.random() * bank.length)]
}

const TILE = 56 // square enemy tile size

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function pointsForKill(word: string, phase: PhaseKey, nextStreak: number) {
  const base = 10 + Math.min(10, word.length) * 2
  const phaseBonus = phase === "easy" ? 0 : phase === "medium" ? 5 : 10
  const streakBonus = Math.min(20, nextStreak * 2)
  return base + phaseBonus + streakBonus
}

function TypingGameAuto() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const playRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const challengeId = searchParams?.get('challengeId')
  
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [destroyed, setDestroyed] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [streak, setStreak] = useState(0)
  const [accuracy, setAccuracy] = useState(100)
  const [finalWpm, setFinalWpm] = useState<number | null>(null)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [finalErrors, setFinalErrors] = useState<number | null>(null)

  // Challenge-related state
  const [context, setContext] = useState<Context.MiniAppContext>()
  const [scoreSubmitted, setScoreSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [animTick, setAnimTick] = useState(0)

  const sfx = useSfx()

  const enemiesRef = useRef<Enemy[]>([])
  const targetIdRef = useRef<number | null>(null)
  const nextIdRef = useRef(1)
  const lastSpawnRef = useRef(0)
  const startAtRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)

  // Accuracy counters
  const correctRef = useRef(0)
  const wrongRef = useRef(0)

  // Laser flash
  const [laser, setLaser] = useState<{ sx: number; sy: number; tx: number; ty: number; ts: number } | null>(null)

  // Board size
  const [w, setW] = useState(900)
  const [h, setH] = useState(550)

  // Load Farcaster context if in challenge mode
  useEffect(() => {
    if (challengeId) {
      const loadContext = async () => {
        try {
          const ctx = await sdk.context
          setContext(ctx)
        } catch (error) {
          console.error('Failed to load Farcaster context:', error)
        }
      }
      loadContext()
    }
  }, [challengeId])

  // Submit score for challenge
  const submitChallengeScore = useCallback(async () => {
    if (!challengeId || !context || scoreSubmitted) return

    // Get user's wallet address - for now using FID as identifier
    // In production, you'd get the actual connected wallet address
    const userAddress = `fid:${context.user.fid}` // Placeholder until wallet integration

    try {
      const gameDuration = startAtRef.current ? (Date.now() - startAtRef.current) / 1000 : 0

      const response = await fetch('/api/challenges/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: parseInt(challengeId),
          playerAddress: userAddress,
          playerFid: context.user.fid,
          score: finalScore ?? score,
          wpm: finalWpm ?? 0,
          accuracy: accuracy,
          duration: gameDuration,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setScoreSubmitted(true)
        console.log('Score submitted successfully:', data)
      } else {
        const error = await response.text()
        setSubmitError(`Failed to submit score: ${error}`)
      }
    } catch (error) {
      setSubmitError(`Error submitting score: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [challengeId, context, scoreSubmitted, finalScore, score, finalWpm, accuracy])

  // Auto-submit score when game ends in challenge mode
  useEffect(() => {
    if (gameOver && challengeId && finalScore !== null && !scoreSubmitted) {
      submitChallengeScore()
    }
  }, [gameOver, challengeId, finalScore, scoreSubmitted, submitChallengeScore])

  // Share functionality for normal (non-challenge) games
  const handleShare = useCallback(async () => {
    const shareScore = finalScore ?? score
    const shareWpm = finalWpm ?? 0
    const shareAccuracy = accuracy
    const shareWave = Math.max(1, Math.floor(destroyed / 10) + 1) // Calculate wave for sharing
    
    const shareText = `🎮 Just scored ${shareScore} points in ArbiStrike! ⚡\n\n🎯 ${shareWpm} WPM typing speed\n📊 ${shareAccuracy}% accuracy\n🔥 ${destroyed} enemies destroyed\n⚔️ Reached Wave ${shareWave}\n\nPlay this epic space typing shooter! 🚀`;
    
    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: [window.location.href]
      });
    } catch (error) {
      console.error("Failed to share:", error);
      try {
        await navigator.clipboard.writeText(shareText + `\n\nPlay at: ${window.location.href}`);
        console.log("📋 Copied to clipboard!");
      } catch (clipboardError) {
        console.error("Failed to copy to clipboard:", clipboardError);
      }
    }
  }, [finalScore, score, finalWpm, accuracy, destroyed])

  const resize = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 0
    setW(Math.max(320, Math.floor(rect.width - pad)))
    setH(Math.max(420, Math.floor((rect.width * 9) / 16))) // 16:9-ish
  }, [])
  useEffect(() => {
    resize()
    const obs = new ResizeObserver(resize)
    if (wrapRef.current) obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [resize])

  // Focus handling
  const focusPlay = () => playRef.current?.focus()

  const resetGame = useCallback(() => {
    enemiesRef.current = []
    targetIdRef.current = null
    nextIdRef.current = 1
    lastSpawnRef.current = 0
    startAtRef.current = null
    lastTickRef.current = null
    setScore(0)
    setDestroyed(0)
    setStreak(0)
    setLongestStreak(0)
    correctRef.current = 0
    wrongRef.current = 0
    setAccuracy(100)
    setPaused(false)
    setGameOver(false)
    setLaser(null)
    setFinalWpm(null)
    setFinalScore(null)
    setFinalErrors(null)
  }, [])

  const startGame = useCallback(() => {
    resetGame()
    setRunning(true)
    // focus after paint
    setTimeout(focusPlay, 0)
  }, [resetGame])

  const endGame = useCallback(() => {
    setRunning(false)
    const elapsed = (lastTickRef.current ?? performance.now()) - (startAtRef.current ?? performance.now())
    const minutes = Math.max(1 / 60, elapsed / 60000)

    const wpm = Math.round(destroyed / minutes)
    setFinalWpm(wpm)
    setFinalErrors(wrongRef.current)

    // New composite scoring:
    // - Kills score (existing 'score') remains
    // - + WPM weighted strongly
    // - + Accuracy weighted
    // - - Errors penalty
    // - + Streak and destroyed small bonuses
    const wpmComponent = wpm * 10
    const accComponent = Math.round(accuracy * 5) // accuracy is 0..100
    const errorPenalty = wrongRef.current * 4
    const streakBonus = longestStreak * 2
    const destroyBonus = destroyed * 1

    const composite = Math.max(
      0,
      Math.round(score + wpmComponent + accComponent - errorPenalty + streakBonus + destroyBonus),
    )
    setFinalScore(composite)

    setGameOver(true)
    sfx.bomb()
  }, [accuracy, sfx, score, longestStreak, destroyed])

  // Main loop
  useEffect(() => {
    if (!running || paused) return
    let raf = 0
    const loop = (t: number) => {
      if (!startAtRef.current) startAtRef.current = t
      if (!lastTickRef.current) lastTickRef.current = t
      const dt = Math.min(64, t - lastTickRef.current) / 1000 // limit step
      lastTickRef.current = t

      const elapsed = t - (startAtRef.current ?? t)
      const cfg = phaseConfig(elapsed)

      // Spawn
      if (t - lastSpawnRef.current >= cfg.spawnMs && enemiesRef.current.length < cfg.maxAtOnce) {
        lastSpawnRef.current = t
        const wordRaw = pickWord(cfg.phase)
        // enforce word length constraints
        const word = wordRaw.slice(0, clamp(wordRaw.length, cfg.minLen, cfg.maxLen))
        const size = TILE
        const x = clamp(Math.random() * (w - size), 8, w - size - 8)
        const y = -size - 6
        const e: Enemy = {
          id: nextIdRef.current++,
          word,
          typed: 0,
          x,
          y,
          speed: cfg.speed,
          sprite: (1 + Math.floor(Math.random() * 4)) as 1 | 2 | 3 | 4,
          size,
        }
        enemiesRef.current = [...enemiesRef.current, e]
      }

      // Move and check bottom
      let ended = false
      enemiesRef.current = enemiesRef.current.map((e) => ({ ...e, y: e.y + e.speed * dt }))
      for (const e of enemiesRef.current) {
        // Only end game when enemies actually reach the ship area (much closer to bottom)
        if (e.y >= h - 50) {
          ended = true
          break
        }
      }
      if (ended) {
        endGame()
        return
      }

      // Clean laser flash after 120ms
      if (laser && performance.now() - laser.ts > 120) setLaser(null)

      setAnimTick((n) => (n + 1) % 1_000_000)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, paused, w, h, laser, endGame])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!running || paused) return
      if (e.key === "Escape") {
        setPaused((p) => !p)
        return
      }
      const key = e.key.toLowerCase()
      if (!/^[a-z]$/.test(key)) return

      const enemies = enemiesRef.current
      if (!enemies.length) {
        wrongRef.current++
        updateAccuracy()
        sfx.wrong()
        return
      }

      let targetIdx = enemies.findIndex((en) => en.id === targetIdRef.current)
      if (targetIdx === -1) {
        targetIdx = enemies.findIndex((en) => en.word[en.typed] === key)
        if (targetIdx === -1) {
          wrongRef.current++
          updateAccuracy()
          sfx.wrong()
          return
        }
        targetIdRef.current = enemies[targetIdx].id
      }

      const en = enemies[targetIdx]
      if (!en) return

      if (en.word[en.typed] === key) {
        en.typed++
        correctRef.current++
        updateAccuracy()
        const now = performance.now()
        const shipX = w / 2
        const shipY = h - 24 // approx center of the ship triangle near bottom
        const targetX = clamp(en.x + en.size / 2, 0, w)
        const targetY = clamp(en.y + en.size / 2, 0, h)
        setLaser({ sx: shipX, sy: shipY, tx: targetX, ty: targetY, ts: now })
        sfx.shoot()

        if (en.typed >= en.word.length) {
          const elapsedMs = performance.now() - (startAtRef.current ?? performance.now())
          const phase = phaseConfig(elapsedMs).phase
          const nextStreak = streak + 1
          const pts = pointsForKill(en.word, phase, nextStreak)
          sfx.explode()
          setScore((s) => s + pts)
          setDestroyed((d) => d + 1)
          const newEnemies = enemiesRef.current.slice()
          newEnemies.splice(targetIdx, 1)
          enemiesRef.current = newEnemies
          targetIdRef.current = null
          setStreak((s) => {
            const ns = s + 1
            setLongestStreak((ls) => (ns > ls ? ns : ls))
            return ns
          })
        }
      } else {
        wrongRef.current++
        updateAccuracy()
        setStreak(0)
        sfx.wrong()
      }
    }

    const updateAccuracy = () => {
      const correct = correctRef.current
      const wrong = wrongRef.current
      const total = correct + wrong
      const pct = total === 0 ? 100 : Math.round((correct / total) * 100)
      setAccuracy(pct)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [running, paused, sfx, w, h])

  const currentPhase = useMemo<PhaseKey>(() => {
    if (!running || startAtRef.current == null) return "easy"
    const elapsed = performance.now() - startAtRef.current
    return phaseConfig(elapsed).phase
  }, [running])

  // UI helpers
  const phaseLabel = currentPhase === "easy" ? "EASY" : currentPhase === "medium" ? "MEDIUM" : "HARD"
  const wave = Math.max(1, Math.floor(destroyed / 10) + 1) // simple wave metric

  return (
    <div ref={wrapRef} className="relative w-full bg-black mx-auto max-w-md md:max-w-lg min-h-screen">
      <div
        ref={playRef}
        tabIndex={0}
        aria-label="Typing play area"
        className="relative outline-none min-h-screen"
        style={{
          width: w,
          height: Math.max(h, window.innerHeight),
          margin: "0 auto",
          backgroundImage: `url('/space-starfield-nebula-dark.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "local",
        }}
        onMouseDown={focusPlay}
      >
        {/* Grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 32px)",
          }}
        />

        {/* HUD */}
        <div className="absolute top-2 left-2 text-xs md:text-sm text-white/80 flex gap-3">
          <div>
            <span className="text-white/60">SCORE</span>
            <div className="font-mono">{String(score).padStart(6, "0")}</div>
          </div>
          <div>
            <span className="text-white/60">WAVE</span>
            <div className="font-mono">{String(wave).padStart(3, "0")}</div>
          </div>
          <div>
            <span className="text-white/60">PHASE</span>
            <div className="font-mono">{phaseLabel}</div>
          </div>
          <div>
            <span className="text-white/60">ACCURACY</span>
            <div className="font-mono">{accuracy}%</div>
          </div>
        </div>

        {/* Bottom ship marker */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <defs>
              <filter id="ship-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Triangle pointing up */}
            <polygon points="14,2 26,26 2,26" fill={COLORS.primary} opacity="0.9" filter="url(#ship-glow)" />
            {/* Stroke outline */}
            <polygon points="14,2 26,26 2,26" fill="none" stroke={COLORS.primary} strokeWidth="1.5" opacity="0.9" />
          </svg>
          <p className="sr-only">Player ship</p>
        </div>

        {/* Laser flash */}
        {laser && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
          >
            <defs>
              <linearGradient id="beam-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.primary} />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </linearGradient>
              <filter id="beam-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.5" />
              </filter>
            </defs>
            <line
              x1={laser.sx}
              y1={laser.sy}
              x2={laser.tx}
              y2={laser.ty}
              stroke="url(#beam-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="url(#beam-glow)"
            />
          </svg>
        )}

        {/* Enemies as square tiles with alien art and word labels */}
        {enemiesRef.current.map((e) => {
          const isTarget = e.id === targetIdRef.current
          return (
            <div key={e.id} className="absolute" style={{ left: e.x, top: e.y, width: e.size, height: e.size }}>
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: e.size,
                  height: e.size,
                  border: `1px solid ${isTarget ? COLORS.accent : COLORS.primary}`,
                  background: "rgba(2, 6, 23, 0.6)",
                  boxShadow: isTarget ? `0 0 14px ${COLORS.accent}` : `0 0 10px ${COLORS.primary}`,
                }}
                aria-label={`Enemy ${e.word}`}
              >
                <img
                  src={`/images/aliens/alien-${e.sprite}.png`}
                  alt=""
                  width={40}
                  height={40}
                  className="opacity-90"
                />
                {/* Word label */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/50 text-white/90 text-xs font-medium">
                  <span aria-hidden>
                    <span style={{ color: COLORS.accent }}>{e.word.slice(0, e.typed)}</span>
                    <span>{e.word.slice(e.typed)}</span>
                  </span>
                  <span className="sr-only">
                    {e.word} with {e.typed} letters typed
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {/* Start overlay */}
        {!running && !gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center px-6 py-8 rounded-lg border border-white/10 bg-black/40 backdrop-blur">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Ready?</h2>
              <p className="mt-2 text-white/70 text-sm md:text-base">
                Type to target and destroy descending words.
                <br />
              </p>
              <button
                onClick={startGame}
                className="mt-5 inline-flex items-center justify-center rounded-md px-5 py-2 text-sm font-medium"
                style={{
                  background: COLORS.accent,
                  color: "#111",
                }}
              >
                Play
              </button>
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {running && paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center px-6 py-8 rounded-lg border border-white/10 bg-black/40 backdrop-blur">
              <h3 className="text-xl md:text-2xl font-semibold">Paused</h3>
              <p className="mt-2 text-white/70 text-sm">Press Esc to resume</p>
            </div>
          </div>
        )}

        {/* Game over/results overlay with Play Again */}
        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-md mx-4 px-6 py-6 rounded-lg border border-white/10 bg-black/50 backdrop-blur">
              <h3 className="text-center text-2xl font-semibold tracking-tight">Mission Report</h3>
              
              {/* Challenge Status */}
              {challengeId && (
                <div className="mt-4 p-4 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 backdrop-blur-sm">
                  <div className="text-center">
                    {scoreSubmitted ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                        <div className="text-green-400 font-semibold">Score Submitted Successfully!</div>
                      </div>
                    ) : submitError ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">✕</span>
                        </div>
                        <div className="text-red-400 font-semibold">{submitError}</div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-400 border-t-transparent"></div>
                        <div className="text-cyan-400 font-semibold">Submitting score...</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">Final Score</div>
                  <div className="font-mono text-xl">{String(finalScore ?? score).padStart(6, "0")}</div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">You Reached</div>
                  <div className="font-mono text-xl">WAVE {String(wave).padStart(3, "0")}</div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">Accuracy</div>
                  <div className="font-mono text-xl">{accuracy}%</div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">Typing Speed</div>
                  <div className="font-mono text-xl">{finalWpm ?? 0} WPM</div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">Words Destroyed</div>
                  <div className="font-mono text-xl">{destroyed}</div>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="text-white/60">Longest Streak</div>
                  <div className="font-mono text-xl">{longestStreak}</div>
                </div>
                <div className="border-t border-white/10 pt-3 col-span-2">
                  <div className="text-white/60">Errors</div>
                  <div className="font-mono text-xl">{finalErrors ?? 0}</div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => window.location.href = '/'}
                  disabled={challengeId ? (!scoreSubmitted && !submitError) : false}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium border border-white/20 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all duration-200"
                >
                  Home
                </button>
                {/* Only show share button for non-challenge games */}
                {!challengeId && (
                  <button
                    onClick={handleShare}
                    className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-lg transition-all duration-200 hover:scale-105"
                  >
                    <span className="mr-1">🚀</span>
                    Share
                  </button>
                )}
                <button
                  onClick={startGame}
                  disabled={challengeId ? (!scoreSubmitted && !submitError) : false}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-orange-500 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                >
                  Play again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TypingGameAuto
export { TypingGameAuto }
