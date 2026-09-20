function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodeHtmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  if (normalized.startsWith("#x")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }
  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: "\"",
    raquo: "»",
    rdquo: "”",
    rsquo: "’"
  };
  return named[normalized] ?? `&${entity};`;
}

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "li", "ul", "ol", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "tr"
]);

function findTagEnd(value: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function parseTag(tag: string): Readonly<{ name: string; closing: boolean }> | undefined {
  const match = tag.match(/^<\s*(\/?)\s*([a-z0-9:-]+)/i);
  if (!match?.[2]) return undefined;
  return { name: match[2].toLowerCase(), closing: Boolean(match[1]) };
}

function htmlToPlainText(value: string): string {
  let output = "";
  const lower = value.toLowerCase();

  for (let index = 0; index < value.length;) {
    if (value.startsWith("<!--", index)) {
      const commentEnd = value.indexOf("-->", index + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : value.length;
      continue;
    }

    if (value[index] !== "<") {
      output += value[index];
      index += 1;
      continue;
    }

    const tagEnd = findTagEnd(value, index);
    if (tagEnd < 0) {
      output += value[index];
      index += 1;
      continue;
    }

    const tag = value.slice(index, tagEnd + 1);
    const parsed = parseTag(tag);
    if (!parsed) {
      index = tagEnd + 1;
      continue;
    }

    if (!parsed.closing && (parsed.name === "script" || parsed.name === "style")) {
      const closeStart = lower.indexOf(`</${parsed.name}`, tagEnd + 1);
      if (closeStart < 0) {
        index = value.length;
        continue;
      }
      const closeEnd = findTagEnd(value, closeStart);
      index = closeEnd >= 0 ? closeEnd + 1 : value.length;
      continue;
    }

    if (!parsed.closing && parsed.name === "br") output += "\n";
    else if (!parsed.closing && parsed.name === "li") output += "• ";
    else if (parsed.closing && BLOCK_TAGS.has(parsed.name)) output += "\n\n";

    index = tagEnd + 1;
  }

  return output;
}

function isolateLastAssistantTurn(value: string): string {
  const markers = [
    'data-message-author-role="assistant"',
    "data-message-author-role='assistant'",
    'data-turn="assistant"',
    "data-turn='assistant'"
  ];

  let markerIndex = -1;
  for (const marker of markers) markerIndex = Math.max(markerIndex, value.lastIndexOf(marker));
  if (markerIndex < 0) return value;

  const tagStart = value.lastIndexOf("<", markerIndex);
  if (tagStart < 0) return value.slice(markerIndex);

  const tagEnd = findTagEnd(value, tagStart);
  return tagEnd >= 0 ? value.slice(tagEnd + 1) : value.slice(markerIndex);
}

/**
 * Convert supplier/editor HTML into safe public plain text.
 *
 * Some imported supplier descriptions accidentally contain a copied ChatGPT
 * conversation DOM. Those exports include Tailwind selectors with literal ">"
 * characters inside quoted class attributes, so regex tag stripping can leak
 * markup into the customer-facing description. This parser tracks quoted
 * attributes, removes tags safely, and for recognized conversation exports keeps
 * only the final assistant turn that contains the intended product copy.
 */
export function publicDescriptionText(value: unknown): string | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;

  const looksLikeConversationExport =
    /data-testid=["']conversation-turn-|text-token-text-primary|data-message-author-role=["'](?:assistant|user)["']|data-turn=["'](?:assistant|user)["']/i.test(raw);

  const publicRaw = looksLikeConversationExport ? isolateLastAssistantTurn(raw) : raw;
  const normalized = htmlToPlainText(publicRaw)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (_match, entity: string) => decodeHtmlEntity(entity))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || undefined;
}
