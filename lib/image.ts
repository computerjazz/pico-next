import sharp from "sharp";
import Tesseract, { createWorker } from "tesseract.js";
import fs from "fs/promises";
import path from "path";

let workerPromise: Promise<Tesseract.Worker> | undefined = undefined;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

export async function shrinkBase64Image({
  base64Data,
  targetBytes,
}: {
  base64Data: string;
  targetBytes: number;
}) {
  try {
    const input = Buffer.from(base64Data, "base64");
    const profiles = [
      { width: 500, quality: 55 },
      { width: 420, quality: 48 },
      { width: 360, quality: 42 },
      { width: 320, quality: 36 },
      { width: 260, quality: 30 },
      { width: 220, quality: 26 },
    ] as const;

    let best: Buffer | null = null;
    for (const profile of profiles) {
      const out = await sharp(input)
        .rotate()
        .resize({ width: profile.width, withoutEnlargement: true })
        .jpeg({ quality: profile.quality, mozjpeg: true })
        .toBuffer();
      best = out;
      if (out.length <= targetBytes) break;
    }
    const processed = best ?? input;
    return {
      base64Data: processed.toString("base64"),
      mimeType: "image/jpeg",
    };
  } catch {
    return { base64Data, mimeType: "image/jpeg" };
  }
}

export async function cropBase64ImageQuadrant({
  base64Data = "",
  quadrant,
}: {
  base64Data?: string | null;
  quadrant: "upperLeft" | "upperRight" | "lowerLeft" | "lowerRight";
}) {
  try {
    let rawBase64 = base64Data || "";
    // If the input starts with a data URL prefix, strip it out
    const dataUrlPrefix = /^data:image\/jpeg;base64,/;
    if (dataUrlPrefix.test(base64Data || "")) {
      rawBase64 = base64Data?.replace(dataUrlPrefix, "") || "";
    }
    const input = Buffer.from(rawBase64, "base64");
    const image = sharp(input);
    const metadata = await image.metadata();

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      return { base64Data, mimeType: "image/jpeg" };
    }

    const cropWidth = Math.floor(width / 2);
    const cropHeight = Math.floor(height / 2);

    let left = 0;
    let top = 0;

    switch (quadrant) {
      case "upperLeft":
        left = 0;
        top = 0;
        break;
      case "upperRight":
        left = width - cropWidth;
        top = 0;
        break;
      case "lowerLeft":
        left = 0;
        top = height - cropHeight;
        break;
      case "lowerRight":
        left = width - cropWidth;
        top = height - cropHeight;
        break;
      default:
        left = 0;
        top = 0;
        break;
    }

    const croppedBuffer = await image
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return {
      base64Data: croppedBuffer.toString("base64"),
      mimeType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`,
    };
  } catch {
    return { base64Data, mimeType: "image/jpeg" };
  }
}

export async function extractOCRText({
  imageBase64DataUrl = "",
}: {
  imageBase64DataUrl?: string;
}) {
  const cleanBase64 = imageBase64DataUrl.replace(
    /^data:image\/\w+;base64,/,
    "",
  );
  const buffer = Buffer.from(cleanBase64, "base64");
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return { text };
}

export async function preprocessImage(
  input: string | Buffer = "",
  debugFilename = "debug-ocr.png",
) {
  let buffer: Buffer;

  if (typeof input === "string") {
    const base64 = input.includes(",") ? input.split(",")[1] : input;
    buffer = Buffer.from(base64, "base64");
  } else {
    buffer = input;
  }

  const processed = await sharp(buffer)
    .resize({ width: 1600, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(160)
    .png() // PNG avoids JPEG artifacts during inspection
    .toBuffer();

  // Write to disk so you can inspect
  const outPath = path.join(process.cwd(), debugFilename);
  await fs.writeFile(debugFilename, processed);
  await fs.writeFile("original.jpg", buffer);

  console.log("Saved OCR debug image to:", outPath);

  return processed;
}
