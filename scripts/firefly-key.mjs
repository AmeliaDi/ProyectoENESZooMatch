// Recorta el fondo plano de un retrato de Firefly y lo guarda como PNG con alfa.
// Se usa sharp (transitivo en este proyecto); si el lote crece, conviene declararlo.
import sharp from "sharp";

const [input, output, preview] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error("uso: node scripts/firefly-key.mjs <entrada.jpg> <salida.png> [preview.png]");
  process.exit(2);
}

const TOL = 64; // distancia RGB al color del fondo para considerarlo fondo
const SOFT_T0 = 24;
const SOFT_T1 = TOL;

const src = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = src.info;
const px = src.data;

const rgb = (p) => [px[p * channels], px[p * channels + 1], px[p * channels + 2]];
const dist = (p, c) => {
  const [r, g, b] = rgb(p);
  return Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
};

// Color de fondo: mediana por canal del marco exterior.
const border = [];
for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x);
for (let y = 1; y < height - 1; y += 1) border.push(y * width, y * width + width - 1);
const median = (pick) => {
  const v = border.map(pick).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
const bg = [median((p) => rgb(p)[0]), median((p) => rgb(p)[1]), median((p) => rgb(p)[2])];

// Inundación desde el borde sobre píxeles cercanos al color de fondo:
// elimina el fondo y la sombra de suelo contiguos, respeta los neutros cerrados
// (manchas claras del cuerpo) porque no son alcanzables desde el marco.
const isBg = new Uint8Array(width * height);
const stack = [...border];
while (stack.length > 0) {
  const p = stack.pop();
  if (isBg[p] === 1) continue;
  if (dist(p, bg) > TOL) continue;
  isBg[p] = 1;
  const x = p % width;
  const y = (p - x) / width;
  if (x > 0) stack.push(p - 1);
  if (x < width - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - width);
  if (y < height - 1) stack.push(p + width);
}

// Alfa: 0 en fondo, 255 en sujeto. La rampa de suavizado sólo se aplica a los
// píxeles tocando el fondo; los neutros interiores (manchas claras) no se tocan.
const alpha = new Float64Array(width * height);
for (let p = 0; p < width * height; p += 1) {
  alpha[p] = isBg[p] === 1 ? 0 : 255;
}
const touchesBg = (p, x, y) =>
  (x > 0 && isBg[p - 1] === 1) ||
  (x < width - 1 && isBg[p + 1] === 1) ||
  (y > 0 && isBg[p - width] === 1) ||
  (y < height - 1 && isBg[p + width] === 1);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const p = y * width + x;
    if (alpha[p] !== 255 || !touchesBg(p, x, y)) continue;
    const d = dist(p, bg);
    const ramp = d <= SOFT_T0 ? 0 : d >= SOFT_T1 ? 255 : ((d - SOFT_T0) / (SOFT_T1 - SOFT_T0)) * 255;
    alpha[p] = Math.max(ramp, 48);
  }
}
for (let p = 0; p < width * height; p += 1) {
  px[p * channels + 3] = Math.round(alpha[p]);
}

const out = await sharp(px, { raw: { width, height, channels } })
  .trim({ threshold: 1 })
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp(out).toFile(output);

if (preview !== undefined) {
  const magenta = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#ff00ff" } })
    .png()
    .toBuffer();
  await sharp(magenta).composite([{ input: out, blend: "over" }]).png().toFile(preview);
}

let visible = 0;
for (let p = 0; p < width * height; p += 1) {
  if (px[p * channels + 3] > 16) visible += 1;
}
console.log(
  `${output}: ${width}x${height}, conservado ${Math.round((visible / (width * height)) * 100)}%, fondo rgb(${bg.join(",")})`,
);
