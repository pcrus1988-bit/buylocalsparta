import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("./crawl-polo-html.mjs", import.meta.url);
let source = await readFile(sourcePath, "utf8");

const replacements = [
  [
    "const color=valueFor(attrs,/(χρωμα|color|colour)/i)||stripHtml(body).match(",
    "const color=valueFor(attrs,/(χρωμα|color|colour)/i)||(stripHtml(body).match("
  ],
  [
    "?.[1]?.trim()??\"\"; const size=",
    "?.[1]?.trim()??\"\"); const size="
  ],
  [
    "const size=valueFor(attrs,/(μεγεθος|size)/i)||stripHtml(body).match(",
    "const size=valueFor(attrs,/(μεγεθος|size)/i)||(stripHtml(body).match("
  ],
  [
    "?.[1]?.trim()??\"\";\n  const capacityAttr=",
    "?.[1]?.trim()??\"\");\n  const capacityAttr="
  ]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`POLO source patch marker not found: ${from}`);
  source = source.replace(from, to);
}

const target = "/tmp/crawl-polo-html-fixed.mjs";
await writeFile(target, source, "utf8");
await import(pathToFileURL(target).href);
