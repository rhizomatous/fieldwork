import { execFileSync } from "node:child_process";
import { mkdir, copyFile, access } from "node:fs/promises";

await mkdir(".cache", { recursive: true });
await mkdir("public/runtime", { recursive: true });
const archive = ".cache/wanix-extras-0.4.0-rc2.tgz";
try {
  await access(archive);
} catch {
  execFileSync(
    "npm",
    [
      "pack",
      "wanix-extras@0.4.0-rc2",
      "--pack-destination",
      ".cache",
      "--silent",
    ],
    { stdio: "inherit" },
  );
}
execFileSync("tar", [
  "-xzf",
  archive,
  "-C",
  ".cache",
  "package/dist/v86.tgz",
  "package/dist/wanix-linux.tgz",
]);
await copyFile(
  "node_modules/wanix/dist/wanix.min.js",
  "public/runtime/wanix.min.js",
);
// The TinyGo build runs out of heap while expanding Pi's root filesystem.
// Wanix automatically detects the standard Go build and loads its executor.
await copyFile(
  "node_modules/wanix/dist/wanix.debug.wasm",
  "public/runtime/wanix.wasm",
);
await copyFile(".cache/package/dist/v86.tgz", "public/runtime/v86.tgz");
console.log(
  "Wanix assets prepared. Run npm run guest to build the Linux agent image.",
);
