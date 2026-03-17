"use client";

import "./gameoftext.css";
import Script from "next/script";

export default function GameOfTextPage() {
  return (
    <>
      <div id="console" />
      <a
        className="map"
        href="/gameoftext/gotmap.jpg"
        title="By Andy Douglas Day"
      />

      {/* jQuery CDN */}
      <Script
        src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js"
        strategy="afterInteractive"
      />

      {/* Local legacy scripts, loaded after jQuery */}
      <Script src="/gameoftext/jqconsole.js" strategy="afterInteractive" />
      <Script src="/gameoftext/gotrebuilt.js" strategy="afterInteractive" />
      <Script
        src="/gameoftext/jquery.colorbox-min.js"
        strategy="afterInteractive"
      />
    </>
  );
}
