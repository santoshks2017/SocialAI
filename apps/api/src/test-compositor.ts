import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { compositeLayered } from "./services/layeredCompositor.js";
import { getBrandLogoSvg } from "./services/brandLogoService.js";

async function run() {
  const artifactsDir = "/Users/santoshsharma/.gemini/antigravity/brain/d028f5ab-fa43-41d0-8a60-2adf6d199f3b";
  const bgPath = path.join(artifactsDir, "media__1779439292598.jpg"); // background sample
  const carPath = path.join(artifactsDir, "media__1779439252536.png"); // car cutout sample

  console.log("Loading sample assets...");
  const backgroundBuffer = await fs.readFile(bgPath);
  const subjectBuffer = await fs.readFile(carPath);

  // Generate a mock dealer logo: a 300x120 solid orange rect with "DEALER LOGO" text
  const logoBuffer = await sharp({
    create: {
      width: 300,
      height: 120,
      channels: 4,
      background: { r: 249, g: 115, b: 22, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="300" height="120" xmlns="http://www.w3.org/2000/svg">
            <text x="150" y="65" font-family="Arial" font-size="28" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">DEALER LOGO</text>
          </svg>`
        ),
      },
    ])
    .png()
    .toBuffer();

  const brandLogoSvg = getBrandLogoSvg("Hyundai", "#ffffff");

  const dealer = {
    name: "Apex Hyundai Motors India",
    city: "New Delhi",
    address: "A-54, Ring Road, South Ext, Phase II",
    phone: "+91 98765 43210",
    whatsapp: "+91 98765 43210",
    primaryColor: "#f97316",
    logoBuffer,
    brandLogoSvg,
  };

  const templates: Array<"festive" | "premium" | "value" | undefined> = [
    "festive",
    "premium",
    "value",
    undefined,
  ];

  for (const templateStyle of templates) {
    const name = templateStyle || "default";
    console.log(`Compositing ${name} template...`);

    // Override brand logo color for festive to dark slate
    const accentColor = templateStyle === "festive" ? "#1e293b" : "#ffffff";
    const styleBrandLogoSvg = getBrandLogoSvg("Hyundai", accentColor);

    const colorMood = templateStyle === "festive"
      ? "warm"
      : templateStyle === "value"
      ? "cool"
      : "neutral";

    const { finalBuffer } = await compositeLayered({
      backgroundBuffer,
      subjectBuffer,
      dealer: {
        ...dealer,
        brandLogoSvg: styleBrandLogoSvg,
      },
      headline: templateStyle === "festive"
        ? "CELEBRATE INDEPENDENCE DAY!"
        : templateStyle === "premium"
        ? "Unmatched Elegance. Exceptional Performance."
        : templateStyle === "value"
        ? "SAVE UP TO ₹1,50,000 THIS MONTH!"
        : "Experience The Future of Drive.",
      templateStyle,
      colorMood,
    });

    const outputPath = path.join(artifactsDir, `test_output_${name}.jpg`);
    await fs.writeFile(outputPath, finalBuffer);
    console.log(`Saved output to ${outputPath}`);
  }

  console.log("Compositing test completed successfully.");
}

run().catch((err) => {
  console.error("Test failed:", err);
});
