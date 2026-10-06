import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, copyFile, readFile, writeFile, cp } from "node:fs/promises";

import { build } from "esbuild";

const dir = ".cache/pi-runtime";
await mkdir(dir, { recursive: true });
const lock = await readFile("guest/package-lock.json");
const digest = createHash("sha256").update(lock).digest("hex");
let installed = false;
try {
  installed = (await readFile(`${dir}/.lock-digest`, "utf8")) === digest;
} catch {}
await copyFile("guest/package.json", `${dir}/package.json`);
await copyFile("guest/package-lock.json", `${dir}/package-lock.json`);
if (!installed) {
  execFileSync(
    "npm",
    ["ci", "--prefix", dir, "--omit=optional", "--ignore-scripts"],
    { stdio: "inherit" },
  );
  await writeFile(`${dir}/.lock-digest`, digest);
}
for (const file of ["supervisor.mjs", "provider.mjs"]) {
  await copyFile(`guest/${file}`, `${dir}/${file}`);
}
await build({
  entryPoints: [`${dir}/supervisor.mjs`],
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
const pi = `${dir}/node_modules/@mariozechner/pi-coding-agent`;
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
