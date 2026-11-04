"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", background: "#F3F1E7", textAlign: "center", paddingTop: 80 }}>
        <h1>Something went wrong</h1>
        <button type="button" onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
