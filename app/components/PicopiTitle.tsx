"use client";

import { useState } from "react";
const O_OPTIONS = ["ø", "ô", "ó", "ö", "0", "õ", "ਠ"];
function PicopiTitle() {
  const [oIdx] = useState(() => Math.floor(Math.random() * O_OPTIONS.length));
  const o = O_OPTIONS[oIdx];
  return <h1 className="text-3xl font-bold text-accent mb-2">{`pic${o}pi`}</h1>;
}

export default PicopiTitle;
