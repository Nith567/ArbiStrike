// Make sure the file exists at src/components/ztype/typing-game-auto.tsx
import { TypingGameAuto } from "~/components/ztype/typing-game-auto";

export const metadata = {
  title: "ZTyping | Space Typing Game",
  description: "A space-themed typing shooter with increasing difficulty and levels.",
}

export default function ZTypePage() {
  return (
    <main className="min-h-[100svh] bg-black text-white">
      <section className="mx-auto max-w-lg px-4 py-6">
        <h1 className="sr-only">ZTyping Game</h1>
        <TypingGameAuto />
      </section>
    </main>
  )
}
