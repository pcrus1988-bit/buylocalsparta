"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ProductMediaGallery, type ProductMediaGalleryImage } from "./ProductMediaGallery";

type GalleryManifest = Readonly<{
  images?: readonly Readonly<{ id?: string; src?: string; alt?: string }>[];
}>;

type PortalTarget = Readonly<{
  host: HTMLDivElement;
  hidden: readonly Readonly<{ element: HTMLElement; display: string }>[],
  badge: string;
  placeholderLabel: string;
  placeholderSymbol: string;
  artClass: string;
}>;

function existingImages(wrapper: HTMLElement, fallbackAlt: string): ProductMediaGalleryImage[] {
  const seen = new Set<string>();
  const images: ProductMediaGalleryImage[] = [];
  for (const [index, image] of [...wrapper.querySelectorAll<HTMLImageElement>("img")].entries()) {
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    if (!src || seen.has(src)) continue;
    seen.add(src);
    images.push({ id: `existing-${index}`, src, alt: image.alt.trim() || fallbackAlt });
  }
  return images;
}

export function ProductMediaGalleryEnhancer({ canonicalVariantId }: Readonly<{ canonicalVariantId: string }>) {
  const [target, setTarget] = useState<PortalTarget>();
  const [images, setImages] = useState<readonly ProductMediaGalleryImage[]>([]);

  useEffect(() => {
    const art = document.querySelector<HTMLElement>(".product-detail .product-detail-art");
    const wrapper = art?.parentElement;
    if (!art || !wrapper) return;

    const title = document.querySelector<HTMLElement>(".product-detail-copy h1")?.textContent?.trim() || document.title || "Προϊόν";
    const initialImages = existingImages(wrapper, title);
    const badge = art.querySelector<HTMLElement>(".product-badge")?.textContent?.trim() || "";
    const placeholderLabel = art.querySelector<HTMLElement>(".detail-category")?.textContent?.trim() || "Προϊόν";
    const placeholderSymbol = art.querySelector<HTMLElement>(".detail-symbol")?.textContent?.trim() || "•";
    const artClass = [...art.classList].filter((name) => name !== "product-detail-art").join(" ");
    const hidden = [...wrapper.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => ({ element, display: element.style.display }));
    for (const item of hidden) item.element.style.display = "none";

    const host = document.createElement("div");
    host.dataset.productMediaGallery = "enhanced";
    wrapper.appendChild(host);
    setTarget({ host, hidden, badge, placeholderLabel, placeholderSymbol, artClass });
    setImages(initialImages);

    const controller = new AbortController();
    fetch(`/api/catalog-source-gallery/${encodeURIComponent(canonicalVariantId)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then(async (response) => response.ok ? response.json() as Promise<GalleryManifest> : { images: [] })
      .then((manifest) => {
        const sourceImages = (manifest.images ?? [])
          .map((image, index) => {
            const src = typeof image.src === "string" ? image.src.trim() : "";
            if (!src) return undefined;
            return {
              id: typeof image.id === "string" && image.id ? image.id : `source-${index}`,
              src,
              alt: typeof image.alt === "string" && image.alt.trim() ? image.alt.trim() : title
            } satisfies ProductMediaGalleryImage;
          })
          .filter((image): image is ProductMediaGalleryImage => Boolean(image));

        if (sourceImages.length > initialImages.length) setImages(sourceImages);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("product_source_gallery_manifest_failed", error);
      });

    return () => {
      controller.abort();
      host.remove();
      for (const item of hidden) item.element.style.display = item.display;
    };
  }, [canonicalVariantId]);

  if (!target) return null;
  return createPortal(
    <ProductMediaGallery
      images={images}
      badge={target.badge}
      placeholderLabel={target.placeholderLabel}
      placeholderSymbol={target.placeholderSymbol}
      artClass={target.artClass}
    />,
    target.host
  );
}
