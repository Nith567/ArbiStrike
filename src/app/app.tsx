"use client";

import dynamic from "next/dynamic";
import ReactDOM from "react-dom";

const Demo = dynamic(() => import("~/components/Demo"), {
  ssr: false,
});

export default function App(
  { title }: { title?: string } = { title: "ArbiStrike" }
) {
  ReactDOM.preconnect('https://auth.farcaster.xyz')

  return <Demo title={title} />;
}
