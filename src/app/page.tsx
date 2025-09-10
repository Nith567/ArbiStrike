import { Metadata } from "next";
import App from "./app";

const appUrl = process.env.NEXT_PUBLIC_URL;

const frame = {
  version: "next",
  imageUrl: `${appUrl}/icon.png`,
  button: {
    title: "ArbiStrike",
    action: {
      type: "launch_frame",
      name: "ArbiStrike",
      url: appUrl,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#f7f7f7c0",
    },
  },
};

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "ArbiStrike",
    openGraph: {
      title: "ArbiStrike",
      description: "ArbiStrike - Bet with friends to Earn on Arbitrum",
    },
    other: {
      "fc:frame": JSON.stringify(frame),
    },
  };
}

export default function Home() {
  return (
    <App />
  );
}
