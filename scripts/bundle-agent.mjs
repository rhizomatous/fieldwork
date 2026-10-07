import { mkdir, copyFile, cp } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

import { guestRuntimeDir } from "./prepare-guest.mjs";

await build({
  entryPoints: ["guest/supervisor.ts"],
  nodePaths: [path.resolve(guestRuntimeDir, "node_modules")],
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

const pi = `${guestRuntimeDir}/node_modules/@mariozechner/pi-coding-agent`;
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
