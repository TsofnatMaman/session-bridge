// Renders the PNG icons that Chrome requires from the single SVG source.
// Usage: npm run build:icons
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const ICON_DIR = new URL("../src/icons/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", ICON_DIR));

for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`icon-${size}.png`, ICON_DIR), png);
}
