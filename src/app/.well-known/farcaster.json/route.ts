export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_URL;

  const config = {
    accountAssociation: {
      header: "eyJmaWQiOjM4MjY1NCwidHlwZSI6ImF1dGgiLCJrZXkiOiIweGNlN2ZiQWVjMzk5MkJkNDhiQ2RERTFEODVmNDkyQTIwOTY3OTlDNDEifQ",
      payload: "eyJkb21haW4iOiJmcmFtZXMtdjItdHlwaW5nLWdhbWUtNGw5aS52ZXJjZWwuYXBwIn0",
      signature: "ZKvNo6YlAUhFOnI0fYQ1LT31twEP40+OqmutIdWuupQ1J3lWUWi9vnUAYKmbnToURFCkVBN9fmvWodYk+gXxGxw="
  },
    frame: {
      version: "1",
      name: "Frames v2 Demo",
      iconUrl: `${appUrl}/icon.png`,
      homeUrl: appUrl,
      imageUrl: `${appUrl}/frames/hello/opengraph-image`,
      buttonTitle: "Launch Frame",
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#f7f7f7",
webhookUrl: "https://api.neynar.com/f/app/4d455c47-492f-4014-8b69-0613c80b23f2/event"
    },
  };

  return Response.json(config);
}
