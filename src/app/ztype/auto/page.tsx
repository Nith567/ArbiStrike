export default function Page() {
  // Simple server component wrapper; the game is a client component below.
  return (
    <main className="min-h-[100dvh] bg-black text-white">
      <section className="mx-auto max-w-lg px-4 py-6 md:py-10">
        <header className="mb-6 md:mb-8 text-center">
          <h1 className="text-balance text-3xl md:text-5xl font-semibold tracking-tight">ZTyping: Space Siege</h1>
          <p className="mt-2 text-sm md:text-base text-white/70">
            Type to target and destroy descending words. Esc to pause. Click the play area to focus.
          </p>
        </header>
        <div className="rounded-lg border border-white/10 overflow-hidden">
          {/* Client component */}
          {/* @ts-expect-error Server/Client boundary in Next.js */}
          <TypingGameAuto />
        </div>
      </section>
    </main>
  )
}

// Note: importing at the end helps when the file is treated as a server component.
import TypingGameAuto from "~/components/ztype/typing-game-auto"
