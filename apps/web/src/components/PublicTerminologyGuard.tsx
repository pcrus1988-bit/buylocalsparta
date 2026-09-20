"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const INTERNAL_ROUTE_PREFIXES = ["/admin", "/driver"] as const;
const PUBLIC_TEXT_ATTRIBUTES = ["aria-label", "title", "placeholder", "alt"] as const;

export function sanitizePublicPartnerTerminology(value: string): string {
  return value
    .replace(/BrandsGateway\s*\/\s*(?:NOVA|Nova)(?:\s*V2)?/gi, "συνεργαζόμενος προμηθευτής")
    .replace(/(?:NOVA|Nova)(?:\s*V2)?\s*\/\s*BrandsGateway/gi, "συνεργαζόμενος προμηθευτής")
    .replace(/Brands\s*Gateway/gi, "συνεργαζόμενος προμηθευτής")
    .replace(/BrandsGateway/gi, "συνεργαζόμενος προμηθευτής")
    .replace(/Symphonya/gi, "συνεργαζόμενος προμηθευτής")
    .replace(/dropshipping\s+προϊόντων/gi, "προϊόντων συνεργαζόμενου προμηθευτή")
    .replace(/dropshipping\s+προϊόντα/gi, "προϊόντα συνεργαζόμενου προμηθευτή")
    .replace(/dropshipping\s+products?/gi, "partner-supplied products")
    .replace(/dropshipping/gi, "αποστολή συνεργαζόμενου προμηθευτή");
}

function isInternalWorkspace(pathname: string): boolean {
  if (INTERNAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;

  // `/vendor/[id]` is the public storefront route (current ids use the vendor_ prefix).
  // The other `/vendor/*` routes are authenticated merchant workspaces where the
  // operational term remains useful and should not be rewritten.
  if (pathname === "/vendor") return true;
  if (pathname.startsWith("/vendor/") && !/^\/vendor\/vendor_[^/]+(?:\/|$)/.test(pathname)) return true;

  return false;
}

function sanitizeTextNode(node: Text): void {
  const parent = node.parentElement;
  if (parent?.closest("script, style, noscript")) return;
  const nextValue = sanitizePublicPartnerTerminology(node.data);
  if (nextValue !== node.data) node.data = nextValue;
}

function sanitizeElementAttributes(element: Element): void {
  for (const attribute of PUBLIC_TEXT_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const nextValue = sanitizePublicPartnerTerminology(current);
    if (nextValue !== current) element.setAttribute(attribute, nextValue);
  }
}

function sanitizeSubtree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    sanitizeTextNode(root as Text);
    return;
  }

  if (root instanceof Element) sanitizeElementAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) sanitizeTextNode(current as Text);
    else if (current instanceof Element) sanitizeElementAttributes(current);
    current = walker.nextNode();
  }
}

/**
 * Public-site safety net: internal catalogue terminology must never leak into
 * customer-facing copy. Authenticated merchant/admin/driver workspaces are
 * intentionally excluded because they use the technical term operationally.
 */
export function PublicTerminologyGuard() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (isInternalWorkspace(pathname)) return;

    sanitizeSubtree(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          sanitizeTextNode(mutation.target as Text);
          continue;
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          sanitizeElementAttributes(mutation.target);
          continue;
        }
        for (const addedNode of mutation.addedNodes) sanitizeSubtree(addedNode);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...PUBLIC_TEXT_ATTRIBUTES]
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
