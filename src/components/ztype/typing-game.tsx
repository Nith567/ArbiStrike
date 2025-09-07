"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "~/lib/utils"
import { wordsEasy, wordsMedium, wordsHard } from "~/components/ztype/words"
import { playShoot, playHit, playLose, initAudio } from "~/components/ztype/webaudio"
import sdk, { type Context } from "@farcaster/miniapp-sdk"

type DifficultyKey = "easy" | "medium" | "hard"

type Enemy = {
  id: number
  text: string
  x: number
  y: number
  speed: number // px/sec
  typed: number
  activeTarget?: boolean
}

type Laser = {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  born: number // ms
  ttl: number // ms
}

type Explosion = {
  id: number
  x: number
  y: number
  born: number
  ttl: number
}

// Color system: 5 total (primary + 3 neutrals + 1 accent)
const COLORS = {
  primary: "#22d3ee", // cyan
  accent: "#f59e0b", // amber
  white: "#ffffff",
  gray: "#9ca3af",
  black: "#000000",
}

const START_LIVES = 3

const DIFFICULTY: Record<
  DifficultyKey,
  {
    spawnMs: number
    speedMin: number
    speedMax: number
    maxOnScreen: number
    wordLen: [number, number]
    list: string[]
  }
> = {
  easy: { spawnMs: 1400, speedMin: 18, speedMax: 28, maxOnScreen: 5, wordLen: [3, 6], list: wordsEasy },
  medium: { spawnMs: 1100, speedMin: 28, speedMax: 42, maxOnScreen: 7, wordLen: [4, 8], list: wordsMedium },
  hard: { spawnMs: 850, speedMin: 42, speedMax: 64, maxOnScreen: 9, wordLen: [5, 10], list: wordsHard },
}

function randRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}
function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}
function pickWord(list: string[], lenRange: [number, number]) {
  const [minLen, maxLen] = lenRange
  for (let i = 0; i < 8; i++) {
    const w = list[Math.floor(Math.random() * list.length)]
    if (w.length >= minLen && w.length <= maxLen) return w
  }
  return list[Math.floor(Math.random() * list.length)]
}

export function TypingGame() {
  // const [difficulty, setDifficulty] = useState<DifficultyKey>("easy")
  const [phase, setPhase] = useState<DifficultyKey>("easy")
  const phaseRef = useRef<DifficultyKey>("easy")

  const searchParams = useSearchParams()
  const challengeId = searchParams?.get('challengeId')
  const playerRole = searchParams?.get('role') // 'creator' or 'opponent'

  const [menuOpen, setMenuOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [lives, setLives] = useState(START_LIVES)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [destroyed, setDestroyed] = useState(0)
  const [hiscore, setHiscore] = useState<number>(() => {
    if (typeof window === "undefined") return 0
    const v = Number(window.localStorage.getItem("ztype_hiscore") || "0")
    return Number.isFinite(v) ? v : 0
  })
  const [audioOn, setAudioOn] = useState(true)

  // Challenge-related state
  const [context, setContext] = useState<Context.MiniAppContext>()
  const [scoreSubmitted, setScoreSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [challengeInfo, setChallengeInfo] = useState<any>(null)
  const [isSDKLoaded, setIsSDKLoaded] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const enemiesRef = useRef<Enemy[]>([])
  const lasersRef = useRef<Laser[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const targetIdRef = useRef<number | null>(null)

  const lastSpawnRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  const typedCharsRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  const alienImgsRef = useRef<HTMLImageElement[]>([])
  useEffect(() => {
    const srcs = [
      "/images/aliens/alien-1.png",
      "/images/aliens/alien-2.png",
      "/images/aliens/alien-3.png",
      "/images/aliens/alien-4.png",
    ]
    Promise.all(
      srcs.map(
        (src) =>
          new Promise<HTMLImageElement>((res) => {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => res(img)
            img.src = src
          }),
      ),
    ).then((imgs) => {
      alienImgsRef.current = imgs
    })
  }, [])

  // Load Farcaster context if in challenge mode
  useEffect(() => {
    if (challengeId) {
      console.log('=== DEBUG: ZType game loaded in challenge mode ===');
      console.log('challengeId:', challengeId);
      console.log('playerRole:', playerRole);
      console.log('Current URL:', window.location.href);
      
      const loadContext = async () => {
        try {
          const ctx = await sdk.context
          setContext(ctx)
          
          // Set up SDK ready
          sdk.actions.ready({});
        } catch (error) {
          console.error('Failed to load Farcaster context:', error)
        }
      }

      if (sdk && !isSDKLoaded) {
        setIsSDKLoaded(true);
        loadContext();
        
        return () => {
          sdk.removeAllListeners();
        };
      }

      // Also load challenge info
      const loadChallengeInfo = async () => {
        try {
          console.log('=== DEBUG: Loading challenge info ===')
          console.log('challengeId:', challengeId)
          const response = await fetch(`/api/challenges/${challengeId}/scores`)
          console.log('Challenge API response status:', response.status)
          if (response.ok) {
            const data = await response.json()
            console.log('Challenge API response data:', data)
            setChallengeInfo(data.challenge)
            console.log('Set challengeInfo to:', data.challenge)
          } else {
            console.error('Challenge API error:', response.status, response.statusText)
          }
        } catch (error) {
          console.error('Failed to load challenge info:', error)
        }
      }
      loadChallengeInfo()
    }
  }, [challengeId, isSDKLoaded])

  // Submit score for challenge
  const submitChallengeScore = useCallback(async () => {
    if (!challengeId || !context || scoreSubmitted) return

    console.log('=== DEBUG: Starting score submission ===')
    console.log('challengeId:', challengeId)
    console.log('context.user.fid:', context.user.fid)
    console.log('challengeInfo:', challengeInfo)

    // Get user's wallet address from challenge info
    let userAddress = ''
    if (challengeInfo) {
      console.log('challengeInfo.creatorFid:', challengeInfo.creatorFid)
      console.log('challengeInfo.opponentFid:', challengeInfo.opponentFid)
      console.log('challengeInfo.creator:', challengeInfo.creator)
      console.log('challengeInfo.opponent:', challengeInfo.opponent)
      
      // Check if this user is the creator or opponent based on their FID
      if (context.user.fid === challengeInfo.creatorFid) {
        userAddress = challengeInfo.creator
        console.log('User identified as creator, userAddress:', userAddress)
      } else if (context.user.fid === challengeInfo.opponentFid) {
        userAddress = challengeInfo.opponent
        console.log('User identified as opponent, userAddress:', userAddress)
      } else {
        console.error('User FID does not match creator or opponent FID')
        console.error('Expected:', challengeInfo.creatorFid, 'or', challengeInfo.opponentFid)
        console.error('Got:', context.user.fid)
        return
      }
    } else {
      console.error('Challenge info not available')
      return
    }

    try {
      const gameDuration = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0
      const elapsedMin = Math.max(1 / 60, (performance.now() - startTimeRef.current) / 60000)
      const currentWpm = Math.round(typedCharsRef.current / 5 / elapsedMin)

      console.log('Submitting score with:', {
        challengeId: parseInt(challengeId),
        playerAddress: userAddress,
        playerFid: context.user.fid,
        score: score,
        wpm: currentWpm,
        accuracy: Math.round((destroyed / Math.max(1, destroyed + (START_LIVES - lives))) * 100),
        duration: gameDuration,
      })

      const response = await fetch('/api/challenges/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: parseInt(challengeId),
          playerAddress: userAddress,
          playerFid: context.user.fid,
          score: score,
          wpm: currentWpm,
          accuracy: Math.round((destroyed / Math.max(1, destroyed + (START_LIVES - lives))) * 100),
          duration: gameDuration,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setScoreSubmitted(true)
        console.log('Score submitted successfully:', data)
        
        // If this is the creator playing and challenge is in 'created' status, update to 'waiting_opponent'
        if (challengeInfo && challengeInfo.status === 'created' && context && context.user.fid === challengeInfo.creatorFid) {
          try {
            const updateResponse = await fetch(`/api/challenges/${challengeId}/creator-played`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            
            if (updateResponse.ok) {
              const updateData = await updateResponse.json()
              console.log('Challenge updated to waiting_opponent:', updateData)
              // Update local challenge info
              setChallengeInfo(prev => ({ ...prev, status: 'waiting_opponent' }))
              
              // Send notification to opponent
              try {
                const notifyResponse = await fetch('/api/notify-challenge', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    targetFid: challengeInfo.opponentFid,
                    challengerName: challengeInfo.creatorName || context.user.displayName || context.user.username || 'Someone',
                    usdcAmount: (parseInt(challengeInfo.betAmount) / 1000000).toFixed(6),
                    challengeId: parseInt(challengeId),
                    challengeUrl: `${window.location.origin}/challenge/${challengeId}`
                  })
                })
                
                if (notifyResponse.ok) {
                  const notifyData = await notifyResponse.json()
                  console.log('Notification sent to opponent:', notifyData)
                } else {
                  console.error('Failed to send notification to opponent')
                }
              } catch (notifyError) {
                console.error('Error sending notification:', notifyError)
              }
            }
          } catch (error) {
            console.error('Failed to update challenge status:', error)
          }
        }
      } else {
        const error = await response.text()
        setSubmitError(`Failed to submit score: ${error}`)
      }
    } catch (error) {
      setSubmitError(`Error submitting score: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [challengeId, context, scoreSubmitted, score, destroyed, lives, challengeInfo])

  // Auto-submit score when game ends in challenge mode
  useEffect(() => {
    if (!playing && !menuOpen && challengeId && score > 0 && !scoreSubmitted) {
      submitChallengeScore()
    }
  }, [playing, menuOpen, challengeId, score, scoreSubmitted, submitChallengeScore])

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1

  useEffect(() => {
    function handleResize() {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [dpr])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (menuOpen) return
      if (e.key === "Escape") {
        setPaused((p) => !p)
        return
      }
      if (paused) return

      const key = e.key.toLowerCase()
      if (!/^[a-z]$/.test(key)) {
        if (key === " " || key === "spacebar") e.preventDefault()
        return
      }

      const enemies = enemiesRef.current
      let target = enemies.find((en) => en.activeTarget)
      if (!target) {
        const match = enemies
          .filter((en) => en.typed < en.text.length)
          .find((en) => en.text[en.typed].toLowerCase() === key)
        if (match) {
          match.activeTarget = true
          targetIdRef.current = match.id
          target = match
        }
      }

      if (target) {
        const expected = target.text[target.typed]?.toLowerCase()
        if (expected === key) {
          target.typed++
          typedCharsRef.current++
          if (audioOn) playShoot()
          if (target.typed >= target.text.length) {
            spawnLaserTo(target)
            spawnExplosion(target.x, target.y)
            enemiesRef.current = enemies.filter((e2) => e2.id !== target!.id)
            targetIdRef.current = null
            setDestroyed((n) => n + 1)
            setScore((s) => s + 10 + target!.text.length * 2)
            if (audioOn) playHit()
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [menuOpen, paused, audioOn])

  function getPhaseCfg(now: number) {
    const elapsed = Math.max(0, now - startTimeRef.current)
    let p: DifficultyKey = "easy"
    if (elapsed > 45000) p = "hard"
    else if (elapsed > 20000) p = "medium"
    if (p !== phaseRef.current) {
      phaseRef.current = p
      setPhase(p)
    }
    return DIFFICULTY[p]
  }

  function spawnEnemy(now: number, cfgLocal: (typeof DIFFICULTY)[DifficultyKey]) {
    const canvas = canvasRef.current
    if (!canvas) return
    if (enemiesRef.current.length >= cfgLocal.maxOnScreen) return

    const text = pickWord(cfgLocal.list, cfgLocal.wordLen)
    const speed = randRange(cfgLocal.speedMin, cfgLocal.speedMax) + (level - 1) * 4
    const TILE = 56 * dpr
    const margin = TILE / 2 + 8 * dpr
    const xCenter = randRange(margin, canvas.width - margin)
    const yTop = -TILE
    const id = Math.floor(Math.random() * 1e9)

    enemiesRef.current.push({ id, text, x: xCenter, y: yTop, speed, typed: 0 })
    lastSpawnRef.current = now
  }

  function spawnLaserTo(target: Enemy) {
    const canvas = canvasRef.current
    if (!canvas) return
    const TILE = 56 * dpr
    const id = Math.floor(Math.random() * 1e9)
    lasersRef.current.push({
      id,
      x0: canvas.width / 2,
      y0: canvas.height - 60 * dpr,
      x1: target.x,
      y1: target.y + TILE / 2,
      born: performance.now(),
      ttl: 180,
    })
  }

  function spawnExplosion(x: number, y: number) {
    const id = Math.floor(Math.random() * 1e9)
    explosionsRef.current.push({ id, x, y, born: performance.now(), ttl: 360 })
  }

  function startGame() {
    enemiesRef.current = []
    lasersRef.current = []
    explosionsRef.current = []
    targetIdRef.current = null
    lastSpawnRef.current = 0
    lastTimeRef.current = 0
    typedCharsRef.current = 0
    setScore(0)
    setLevel(1)
    setDestroyed(0)
    setLives(START_LIVES)
    setPaused(false)
    setMenuOpen(false)
    setPlaying(true)
    startTimeRef.current = performance.now()
    phaseRef.current = "easy"
    setPhase("easy")
    initAudio()
  }

  function endGame() {
    setPlaying(false)
    setPaused(false)
    setMenuOpen(true)
    const newHi = Math.max(hiscore, score)
    setHiscore(newHi)
    try {
      window.localStorage.setItem("ztype_hiscore", String(newHi))
    } catch {}
    if (audioOn) playLose()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    function drawStarfield(now: number) {
      const W = canvas.width
      const H = canvas.height
      ctx.fillStyle = COLORS.black
      ctx.fillRect(0, 0, W, H)

      const layers = [
        { count: 60, speed: 0.02, color: COLORS.white, alpha: 0.45 },
        { count: 80, speed: 0.035, color: COLORS.gray, alpha: 0.55 },
        { count: 100, speed: 0.05, color: COLORS.white, alpha: 0.75 },
      ]
      const rng = (seed: number) => Math.abs(Math.sin(seed) * 10000) % 1

      for (let L = 0; L < layers.length; L++) {
        const { count, speed, color, alpha } = layers[L]
        for (let i = 0; i < count; i++) {
          const sx = rng(i * 13.37 + L) * W
          const sy = (rng(i * 91.12 + L) * H + now * speed) % H
          ctx.globalAlpha = alpha
          ctx.fillStyle = color
          ctx.fillRect(sx, sy, 1.5 * dpr, 1.5 * dpr)
        }
      }
      ctx.globalAlpha = 1

      ctx.globalAlpha = 0.08
      ctx.strokeStyle = COLORS.gray
      ctx.lineWidth = 1
      const grid = 48 * dpr
      for (let x = 0; x < W; x += grid) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      for (let y = 0; y < H; y += grid) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    function drawShip() {
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H - 48 * dpr
      ctx.save()
      ctx.translate(cx, cy)
      ctx.strokeStyle = COLORS.primary
      ctx.fillStyle = COLORS.primary
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()
      ctx.moveTo(0, -16 * dpr)
      ctx.lineTo(12 * dpr, 12 * dpr)
      ctx.lineTo(-12 * dpr, 12 * dpr)
      ctx.closePath()
      ctx.stroke()
      ctx.globalAlpha = 0.25
      ctx.beginPath()
      ctx.arc(0, 18 * dpr, 6 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.restore()
    }

    function drawEnemies(dt: number) {
      const enemies = enemiesRef.current
      const W = canvas.width
      const H = canvas.height
      const TILE = 56 * dpr
      const PAD = 6 * dpr
      const imgs = alienImgsRef.current

      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i]
        en.y += en.speed * (dt / 1000) * dpr

        if (en.y > H - 60 * dpr) {
          enemies.splice(i, 1)
          if (targetIdRef.current === en.id) targetIdRef.current = null
          setLives((l) => {
            const nl = l - 1
            if (nl <= 0) endGame()
            return nl
          })
          continue
        }

        const x0 = clamp(en.x - TILE / 2, 8 * dpr, W - TILE - 8 * dpr)
        const y0 = en.y

        ctx.save()
        ctx.globalAlpha = 0.22
        ctx.fillStyle = COLORS.black
        ctx.fillRect(x0, y0, TILE, TILE)
        ctx.globalAlpha = 1
        ctx.lineWidth = 2 * dpr
        ctx.strokeStyle = en.activeTarget ? COLORS.accent : COLORS.gray
        ctx.strokeRect(x0, y0, TILE, TILE)

        const img = imgs.length ? imgs[en.id % imgs.length] : undefined
        if (img) {
          ctx.globalAlpha = 0.9
          ctx.drawImage(img, x0 + PAD, y0 + PAD, TILE - PAD * 2, TILE - PAD * 2)
          ctx.globalAlpha = 1
        } else {
          ctx.strokeStyle = COLORS.primary
          ctx.beginPath()
          ctx.moveTo(x0 + PAD, y0 + PAD)
          ctx.lineTo(x0 + TILE - PAD, y0 + TILE - PAD)
          ctx.moveTo(x0 + TILE - PAD, y0 + PAD)
          ctx.lineTo(x0 + PAD, y0 + TILE - PAD)
          ctx.stroke()
        }

        const text = en.text
        const typedText = text.slice(0, en.typed)
        const restText = text.slice(en.typed)
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.font = `${13 * dpr}px ui-sans-serif, system-ui, -apple-system`

        ctx.globalAlpha = 0.65
        ctx.fillStyle = COLORS.black
        ctx.fillRect(x0, y0 + TILE - 18 * dpr, TILE, 18 * dpr)
        ctx.globalAlpha = 1

        ctx.fillStyle = COLORS.primary
        ctx.fillText(typedText, x0 + TILE / 2 - ctx.measureText(restText).width / 2, y0 + TILE - 9 * dpr)

        ctx.fillStyle = COLORS.white
        ctx.fillText(restText, x0 + TILE / 2 + ctx.measureText(typedText).width / 2, y0 + TILE - 9 * dpr)

        ctx.restore()
      }
    }

    function drawLasers(now: number) {
      const lasers = lasersRef.current
      for (let i = lasers.length - 1; i >= 0; i--) {
        const L = lasers[i]
        const age = now - L.born
        if (age > L.ttl) {
          lasers.splice(i, 1)
          continue
        }
        const t = age / L.ttl
        const x = L.x0 + (L.x1 - L.x0) * t
        const y = L.y0 + (L.y1 - L.y0) * t
        ctx.save()
        ctx.strokeStyle = COLORS.primary
        ctx.lineWidth = 2 * dpr
        ctx.globalCompositeOperation = "lighter"
        ctx.beginPath()
        ctx.moveTo(L.x0, L.y0)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.globalCompositeOperation = "source-over"
        ctx.restore()
      }
    }

    function drawExplosions(now: number) {
      const explosions = explosionsRef.current
      for (let i = explosions.length - 1; i >= 0; i--) {
        const E = explosions[i]
        const age = now - E.born
        if (age > E.ttl) {
          explosions.splice(i, 1)
          continue
        }
        const t = age / E.ttl
        const r = 6 * dpr + 22 * dpr * t
        ctx.save()
        ctx.globalAlpha = 1 - t
        ctx.strokeStyle = COLORS.accent
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.arc(E.x, E.y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    function maybeSpawn(now: number, cfgLocal: (typeof DIFFICULTY)[DifficultyKey]) {
      const base = Math.max(240, cfgLocal.spawnMs - (level - 1) * 80)
      if (now - lastSpawnRef.current >= base) {
        spawnEnemy(now, cfgLocal)
      }
    }

    function checkLevelUp() {
      const nextLevel = Math.floor(destroyed / 10) + 1
      if (nextLevel !== level) setLevel(nextLevel)
    }

    function tick(now: number) {
      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
      lastTimeRef.current = now

      const cfgLocal = getPhaseCfg(now)

      drawStarfield(now)

      if (playing && !paused) {
        maybeSpawn(now, cfgLocal)
        checkLevelUp()
        drawEnemies(dt)
        drawLasers(now)
        drawExplosions(now)
        drawShip()
      } else {
        drawEnemies(0)
        drawLasers(now)
        drawExplosions(now)
        drawShip()
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, paused, level, destroyed, dpr])

  useEffect(() => {
    const enemies = enemiesRef.current
    const exists = enemies.some((e) => e.id === targetIdRef.current)
    if (!exists) {
      enemies.forEach((e) => (e.activeTarget = false))
      targetIdRef.current = null
    }
  })

  const canvasFocusRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = canvasFocusRef.current
    if (!el) return
    el.tabIndex = 0
    if (!menuOpen) el.focus()
  }, [menuOpen])

  const wpm = useMemo(() => {
    const elapsedMin = Math.max(1 / 60, (performance.now() - startTimeRef.current) / 60000)
    return Math.round(typedCharsRef.current / 5 / elapsedMin)
  }, [score, destroyed])

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[480px] overflow-hidden rounded-xl border border-slate-800 bg-black"
      >
        <div
          ref={canvasFocusRef}
          className="absolute inset-0 outline-none"
          role="application"
          aria-label="ZTyping canvas"
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3 text-xs text-slate-300">
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              className="rounded bg-slate-900/60 px-2 py-1 text-slate-200 hover:bg-slate-800"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              className={cn(
                "rounded px-2 py-1",
                audioOn ? "bg-slate-900/60 hover:bg-slate-800" : "bg-slate-900/30 hover:bg-slate-800/60",
              )}
              onClick={() => setAudioOn((a) => !a)}
              aria-pressed={audioOn}
            >
              {audioOn ? "Sound: On" : "Sound: Off"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span>Phase {phase}</span>
            <span>Lvl {level}</span>
            <span>Score {score}</span>
            <span>Lives {lives}</span>
            <span className="hidden sm:inline">WPM {wpm}</span>
          </div>
        </div>

        {menuOpen && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 p-6 text-center">
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs tracking-widest text-slate-400">PHOBOSLAB-INSPIRED</p>
                <h2 className="text-balance text-5xl font-semibold tracking-tight text-slate-200">ZTYPING</h2>
                {challengeId && (
                  <div className="mt-2 p-2 rounded border border-cyan-400/30 bg-cyan-400/10">
                    <div className="text-cyan-400 text-sm font-medium">
                      🏆 Challenge Mode - ID: {challengeId}
                      {playerRole && (
                        <span className="ml-2 px-2 py-1 text-xs rounded bg-cyan-500/20 text-cyan-300">
                          {playerRole === 'creator' ? '👑 Creator' : '⚔️ Challenger'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="max-w-xs text-pretty text-sm text-slate-400">
                Type to lock-on and destroy square alien tiles. The game auto-ramps: Easy → Medium → Hard. Press Esc to
                pause. Click the play area to focus.
                {challengeId && (
                  <span className="block mt-2 text-cyan-400">
                    🎯 Playing for challenge #{challengeId} as {playerRole === 'creator' ? '👑 Creator' : '⚔️ Challenger'}. Your score will be automatically submitted!
                  </span>
                )}
              </p>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={startGame}
                  className="rounded-md bg-amber-500 px-6 py-2 text-base font-medium text-black hover:bg-amber-400"
                >
                  {challengeId ? "Start Challenge" : "Start Game"}
                </button>
                <div className="text-xs text-slate-400">
                  High Score: <span className="text-slate-200">{hiscore}</span>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Square enemies with alien sprites. Colors: cyan primary, amber accent, black/gray/white neutrals.
              </div>
            </div>
          </div>
        )}

        {!menuOpen && paused && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" aria-live="polite">
            <div className="rounded-md border border-slate-800 bg-slate-900/80 px-6 py-4 text-center">
              <div className="mb-2 text-lg font-medium text-slate-200">Paused</div>
              <div className="text-xs text-slate-400">Press Esc to resume</div>
            </div>
          </div>
        )}

        {!menuOpen && !playing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="text-2xl font-semibold text-slate-200">Game Over</div>
              
              {/* Challenge Status */}
              {challengeId && (
                <div className="w-full max-w-sm p-3 rounded border border-cyan-400/30 bg-cyan-400/10">
                  <div className="text-sm">
                    <div className="text-cyan-400 font-medium">Challenge #{challengeId}</div>
                    {scoreSubmitted ? (
                      <>
                        <div className="text-green-400 mt-1">✅ Score Submitted Successfully!</div>
                        {challengeInfo && challengeInfo.status === 'waiting_opponent' && context && context.user.fid === challengeInfo.creatorFid && (
                          <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded">
                            <div className="text-green-400 text-xs font-medium mb-1">🎯 Challenge Ready!</div>
                            <div className="text-xs text-green-300 mb-1">
                              🔔 Your opponent has been notified!
                            </div>
                            <div className="text-xs text-green-400 mt-1">
                              Share link: {window.location.origin}/challenge/{challengeId}
                            </div>
                          </div>
                        )}
                      </>
                    ) : submitError ? (
                      <div className="text-red-400 mt-1">❌ {submitError}</div>
                    ) : (
                      <div className="text-yellow-400 mt-1">📤 Submitting score...</div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="text-sm text-slate-400">
                Score <span className="text-slate-200">{score}</span> • Level{" "}
                <span className="text-slate-200">{level}</span> • WPM <span className="text-slate-200">{wpm}</span>
              </div>
              <button
                onClick={startGame}
                className="rounded-md bg-amber-500 px-6 py-2 text-base font-medium text-black hover:bg-amber-400"
              >
                Try Again
              </button>
              <button
                onClick={() => setMenuOpen(true)}
                className="text-sm text-slate-300 underline-offset-4 hover:underline"
              >
                Back to Menu
              </button>
              {challengeId && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="text-sm text-slate-300 underline-offset-4 hover:underline"
                >
                  Home
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Inspired by space typing shooters. Built with canvas + WebAudio.
      </p>
    </div>
  )
}
