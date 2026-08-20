export type XmlElement = Readonly<{
  name: string;
  localName: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly XmlElement[];
  text: string;
}>;

export type XmlElementSpec = Readonly<{
  name: string;
  attributes?: Readonly<Record<string, string | number | boolean>>;
  text?: string | number | boolean | null;
  children?: readonly XmlElementSpec[];
}>;

type MutableXmlElement = {
  name: string;
  localName: string;
  attributes: Record<string, string>;
  children: MutableXmlElement[];
  text: string;
};

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

export function parseXmlDocument(input: string): XmlElement {
  const xml = input.trim();
  if (!xml.startsWith("<")) throw new Error("Expected XML document");
  if (/<!DOCTYPE/i.test(xml)) throw new Error("DOCTYPE is not allowed in myDATA XML");

  const stack: MutableXmlElement[] = [];
  let root: MutableXmlElement | undefined;
  let cursor = 0;

  while (cursor < xml.length) {
    const next = xml.indexOf("<", cursor);
    if (next < 0) {
      appendText(xml.slice(cursor));
      break;
    }
    if (next > cursor) appendText(xml.slice(cursor, next));

    if (xml.startsWith("<!--", next)) {
      const end = xml.indexOf("-->", next + 4);
      if (end < 0) throw new Error("Unterminated XML comment");
      cursor = end + 3;
      continue;
    }

    if (xml.startsWith("<?", next)) {
      const end = xml.indexOf("?>", next + 2);
      if (end < 0) throw new Error("Unterminated XML processing instruction");
      cursor = end + 2;
      continue;
    }

    if (xml.startsWith("<![CDATA[", next)) {
      const end = xml.indexOf("]]>", next + 9);
      if (end < 0) throw new Error("Unterminated CDATA section");
      const current = stack.at(-1);
      if (!current) throw new Error("CDATA cannot appear outside the root XML element");
      current.text += xml.slice(next + 9, end);
      cursor = end + 3;
      continue;
    }

    if (xml.startsWith("<!", next)) throw new Error("Unsupported XML declaration");

    const end = findTagEnd(xml, next + 1);
    const raw = xml.slice(next + 1, end).trim();
    if (!raw) throw new Error("Empty XML tag");

    if (raw.startsWith("/")) {
      const closingName = raw.slice(1).trim();
      if (!XML_NAME.test(closingName)) throw new Error(`Invalid XML closing tag: ${closingName}`);
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw new Error(`Mismatched XML closing tag: ${closingName}`);
      }
      cursor = end + 1;
      continue;
    }

    const selfClosing = /\/\s*$/.test(raw);
    const tagBody = selfClosing ? raw.replace(/\/\s*$/, "").trim() : raw;
    const parsed = parseStartTag(tagBody);
    const element: MutableXmlElement = {
      name: parsed.name,
      localName: localName(parsed.name),
      attributes: parsed.attributes,
      children: [],
      text: ""
    };

    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else if (root) throw new Error("XML document must have exactly one root element");
    else root = element;

    if (!selfClosing) stack.push(element);
    cursor = end + 1;
  }

  if (stack.length) throw new Error(`Unclosed XML tag: ${stack.at(-1)?.name ?? "unknown"}`);
  if (!root) throw new Error("XML document has no root element");
  return freezeElement(root);

  function appendText(rawText: string): void {
    if (!rawText) return;
    const current = stack.at(-1);
    if (!current) {
      if (rawText.trim()) throw new Error("Text cannot appear outside the root XML element");
      return;
    }
    current.text += decodeXml(rawText);
  }
}

export function childElements(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter(child => child.localName === name);
}

export function descendants(element: XmlElement, name: string): readonly XmlElement[] {
  const matches: XmlElement[] = [];
  visit(element);
  return matches;

  function visit(node: XmlElement): void {
    for (const child of node.children) {
      if (child.localName === name) matches.push(child);
      visit(child);
    }
  }
}

export function childText(element: XmlElement, name: string): string | undefined {
  const child = element.children.find(candidate => candidate.localName === name);
  return child ? textContent(child).trim() || undefined : undefined;
}

export function descendantText(element: XmlElement, name: string): string | undefined {
  const found = descendants(element, name)[0];
  return found ? textContent(found).trim() || undefined : undefined;
}

export function textContent(element: XmlElement): string {
  return element.text + element.children.map(textContent).join("");
}

export function serializeXmlElement(spec: XmlElementSpec): string {
  assertXmlName(spec.name);
  const attrs = Object.entries(spec.attributes ?? {}).map(([key, value]) => {
    assertXmlName(key);
    return ` ${key}="${escapeXml(String(value))}"`;
  }).join("");
  const text = spec.text == null ? "" : escapeXml(String(spec.text));
  const children = (spec.children ?? []).map(serializeXmlElement).join("");
  return text || children
    ? `<${spec.name}${attrs}>${text}${children}</${spec.name}>`
    : `<${spec.name}${attrs}/>`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower === "amp") return "&";
    const codePoint = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : _match;
  });
}

function parseStartTag(raw: string): { name: string; attributes: Record<string, string> } {
  let cursor = 0;
  while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
  const nameStart = cursor;
  while (cursor < raw.length && !/\s/.test(raw[cursor] ?? "")) cursor += 1;
  const name = raw.slice(nameStart, cursor);
  assertXmlName(name);

  const attributes: Record<string, string> = {};
  while (cursor < raw.length) {
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (cursor >= raw.length) break;

    const attrStart = cursor;
    while (cursor < raw.length && !/[\s=]/.test(raw[cursor] ?? "")) cursor += 1;
    const attrName = raw.slice(attrStart, cursor);
    assertXmlName(attrName);
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] !== "=") throw new Error(`XML attribute ${attrName} is missing '='`);
    cursor += 1;
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
    const quote = raw[cursor];
    if (quote !== '"' && quote !== "'") throw new Error(`XML attribute ${attrName} must be quoted`);
    cursor += 1;
    const valueStart = cursor;
    const valueEnd = raw.indexOf(quote, cursor);
    if (valueEnd < 0) throw new Error(`Unterminated XML attribute ${attrName}`);
    attributes[attrName] = decodeXml(raw.slice(valueStart, valueEnd));
    cursor = valueEnd + 1;
  }
  return { name, attributes };
}

function findTagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let cursor = start; cursor < xml.length; cursor += 1) {
    const char = xml[cursor];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ">") return cursor;
  }
  throw new Error("Unterminated XML tag");
}

function localName(name: string): string {
  const separator = name.lastIndexOf(":");
  return separator >= 0 ? name.slice(separator + 1) : name;
}

function freezeElement(element: MutableXmlElement): XmlElement {
  return Object.freeze({
    name: element.name,
    localName: element.localName,
    attributes: Object.freeze({ ...element.attributes }),
    children: Object.freeze(element.children.map(freezeElement)),
    text: element.text
  });
}

function assertXmlName(name: string): void {
  if (!XML_NAME.test(name)) throw new Error(`Invalid XML name: ${name}`);
}
