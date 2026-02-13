import { readFile } from "node:fs/promises";
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
console.log(readme);
