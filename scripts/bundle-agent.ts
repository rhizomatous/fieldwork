import { mkdir, copyFile, cp } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import path from "node:path";

import { build } from "esbuild";

await build({
  entryPoints: ["guest/supervisor.ts"],
  outfile: ".cache/agent.bundle.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  // Image and clipboard features are not used by this text-only embedded agent.
  external: ["@silvia-odwyer/photon-node", "@mariozechner/clipboard"],
});

const piPackage = findPackageJSON(
  "@mariozechner/pi-coding-agent",
  new URL("../guest/package.json", import.meta.url),
);
if (!piPackage) {
  throw new Error(
    "Pi package not found. Run npm ci before bundling the guest.",
  );
}
const pi = path.dirname(piPackage);
await mkdir(".cache/pi-assets/dist/modes/interactive", { recursive: true });

for (const file of ["package.json", "README.md"]) {
  await copyFile(`${pi}/${file}`, `.cache/pi-assets/${file}`);
}

await cp(
  `${pi}/dist/modes/interactive/theme`,
  ".cache/pi-assets/dist/modes/interactive/theme",
  { recursive: true },
);

console.log("Bundled Pi agent core and coding tools for Linux.");
