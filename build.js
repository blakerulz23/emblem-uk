const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "styles.css", "script.js", "package.json", "vercel.json"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

for (const directory of ["public", "assets"]) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), { recursive: true });
}

console.log("Static site built to dist");
