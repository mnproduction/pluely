import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "public/vad");
await mkdir(destination, { recursive: true });
for (const name of ["vad.worklet.bundle.min.js", "silero_vad_legacy.onnx", "silero_vad_v5.onnx"]) {
  await copyFile(resolve(root, "node_modules/@ricky0123/vad-web/dist", name), resolve(destination, name));
}
for (const name of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  await copyFile(resolve(root, "node_modules/onnxruntime-web/dist", name), resolve(destination, name));
}
