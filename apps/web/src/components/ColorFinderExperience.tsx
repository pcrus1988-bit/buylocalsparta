"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  COLOR_FINDER_PRESETS,
  colorMatchPercent,
  deltaE2000,
  hexToLab,
  nearestColorName,
  normalizeHex,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "../lib/color-finder";
import type { ColorFinderContext } from "../lib/color-finder-context";
import styles from "./ColorFinderExperience.module.css";

type FinishFilter = "all" | ColorFinish;
type ProductTypeFilter = "all" | ColorProductType;
type SelectorMode = "picker" | "photo";
type PhotoRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type CropBox = Readonly<{ x: number; y: number; size: number }>;
type HsvColor = Readonly<{ h: number; s: number; v: number }>;
type PhotoPickMode = "spot" | "area";
type PhotoSpot = Readonly<{ x: number; y: number; hex: string }>;
type SortMode = "match" | "price-asc" | "price-desc";

const PHOTO_TTL_MS = 15 * 60 * 1000;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_CANVAS_WIDTH = 1200;
const PHOTO_CANVAS_HEIGHT = 900;
const DEFAULT_CROP_RATIO = 0.28;
const MIN_CROP_RATIO = 0.08;
const MAX_CROP_RATIO = 0.65;
const MIN_MATCH_PERCENT = 49;
const MIN_PROFILE_CONFIDENCE = 0.5;

const FINISH_LABELS: Readonly<Record<ColorFinish, string>> = {
  cream: "Cream",
  pearly: "Pearly",
  shimmer: "Shimmer",
  metallic: "Metallic",
  glitter: "Glitter",
  matte: "Matte",
  jelly: "Jelly",
  classic: "Classic"
};

const TYPE_LABELS: Readonly<Record<ColorProductType, string>> = {
  gel: "Gel",
  regular: "Regular",
  other: "Other"
};

export function ColorFinderExperience({
  products,
  context,
  categoryCode,
  vendorId
}: {
  products: readonly ColorFinderProduct[];
  context: ColorFinderContext;
  categoryCode: string;
  vendorId?: string;
}) {
  const [catalogProducts, setCatalogProducts] = useState<readonly ColorFinderProduct[]>(products);
  const [catalogueState, setCatalogueState] = useState<"loading" | "ready" | "degraded">(
    products.length ? "ready" : "loading"
  );
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [selectedHex, setSelectedHex] = useState("#B52E2E");
  const [hexDraft, setHexDraft] = useState("#B52E2E");
  const [finish, setFinish] = useState<FinishFilter>("all");
  const [productType, setProductType] = useState<ProductTypeFilter>("all");
  const [brand, setBrand] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [selectorMode, setSelectorMode] = useState<SelectorMode>("picker");
  const [pickerHsv, setPickerHsv] = useState<HsvColor>(() => hexToHsv("#B52E2E"));
  const [urlReady, setUrlReady] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [visibleLimit, setVisibleLimit] = useState(24);

  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoExpiresAt, setPhotoExpiresAt] = useState<number>();
  const [photoSecondsLeft, setPhotoSecondsLeft] = useState(0);
  const [photoRect, setPhotoRect] = useState<PhotoRect>();
  const [crop, setCrop] = useState<CropBox>();
  const [photoReady, setPhotoReady] = useState(false);
  const [photoSampleHex, setPhotoSampleHex] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const [photoPickMode, setPhotoPickMode] = useState<PhotoPickMode>("spot");
  const [photoSpot, setPhotoSpot] = useState<PhotoSpot>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef(false);
  const pickerDragRef = useRef(false);
  const photoSpotDragRef = useRef(false);

  const indexedProducts = useMemo(
    () => catalogProducts.map((product) => ({ product, lab: hexToLab(product.colorHex) })),
    [catalogProducts]
  );

  const scoredProducts = useMemo(() => {
    const targetLab = hexToLab(selectedHex);
    return indexedProducts
      .map(({ product, lab }) => {
        const deltaE = deltaE2000(targetLab, lab);
        return { ...product, deltaE, match: colorMatchPercent(deltaE) };
      })
      .sort((left, right) =>
        left.deltaE - right.deltaE
        || (right.profileConfidence ?? 0) - (left.profileConfidence ?? 0)
        || left.priceMinor - right.priceMinor
      );
  }, [indexedProducts, selectedHex]);

  const eligibleProducts = useMemo(
    () => scoredProducts.filter((product) =>
      product.match >= MIN_MATCH_PERCENT
      && (product.profileConfidence ?? 1) >= MIN_PROFILE_CONFIDENCE
    ),
    [scoredProducts]
  );

  const typeCounts = useMemo(() => {
    const counts = new Map<ColorProductType, number>();
    for (const product of eligibleProducts) {
      if (finish !== "all" && product.finish !== finish) continue;
      if (brand !== "all" && product.brand !== brand) continue;
      counts.set(product.productType, (counts.get(product.productType) ?? 0) + 1);
    }
    return counts;
  }, [brand, eligibleProducts, finish]);

  const finishCounts = useMemo(() => {
    const counts = new Map<ColorFinish, number>();
    for (const product of eligibleProducts) {
      if (productType !== "all" && product.productType !== productType) continue;
      if (brand !== "all" && product.brand !== brand) continue;
      counts.set(product.finish, (counts.get(product.finish) ?? 0) + 1);
    }
    return counts;
  }, [brand, eligibleProducts, productType]);

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of eligibleProducts) {
      if (!product.brand) continue;
      if (finish !== "all" && product.finish !== finish) continue;
      if (productType !== "all" && product.productType !== productType) continue;
      counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
    }
    return counts;
  }, [eligibleProducts, finish, productType]);

  const matches = useMemo(() => {
    const filtered = eligibleProducts
      .filter((product) => finish === "all" || product.finish === finish)
      .filter((product) => productType === "all" || product.productType === productType)
      .filter((product) => brand === "all" || product.brand === brand);

    if (sortMode === "price-asc") {
      return filtered.sort((left, right) => left.priceMinor - right.priceMinor || left.deltaE - right.deltaE);
    }
    if (sortMode === "price-desc") {
      return filtered.sort((left, right) => right.priceMinor - left.priceMinor || left.deltaE - right.deltaE);
    }
    return filtered.sort((left, right) =>
      left.deltaE - right.deltaE
      || (right.profileConfidence ?? 0) - (left.profileConfidence ?? 0)
      || left.priceMinor - right.priceMinor
    );
  }, [brand, eligibleProducts, finish, productType, sortMode]);

  const visibleMatches = matches.slice(0, visibleLimit);
  const catalogueAvailable = catalogueState === "ready" && catalogProducts.length > 0;
  const availableFinishes = useMemo(
    () => (Object.keys(FINISH_LABELS) as ColorFinish[])
      .filter((item) => (finishCounts.get(item) ?? 0) > 0 || finish === item),
    [finish, finishCounts]
  );
  const availableTypes = useMemo(
    () => (Object.keys(TYPE_LABELS) as ColorProductType[])
      .filter((type) => (typeCounts.get(type) ?? 0) > 0 || productType === type),
    [productType, typeCounts]
  );
  const availableBrands = useMemo(() => {
    const names = [...brandCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "el"))
      .map(([name]) => name);
    if (brand !== "all" && !names.includes(brand)) names.unshift(brand);
    return names;
  }, [brand, brandCounts]);
  const selectedShade = useMemo(() => nearestColorName(selectedHex), [selectedHex]);
  const fineTuneColors = useMemo(() => {
    const candidates = [
      hsvToHex({ ...pickerHsv, h: pickerHsv.h - 9 }),
      hsvToHex({ ...pickerHsv, h: pickerHsv.h + 9 }),
      hsvToHex({ ...pickerHsv, s: clamp(pickerHsv.s - 0.14, 0, 1) }),
      hsvToHex({ ...pickerHsv, s: clamp(pickerHsv.s + 0.14, 0, 1) }),
      hsvToHex({ ...pickerHsv, v: clamp(pickerHsv.v - 0.12, 0, 1) }),
      hsvToHex({ ...pickerHsv, v: clamp(pickerHsv.v + 0.12, 0, 1) })
    ];
    return [...new Set(candidates)].filter((hex) => hex !== selectedHex).slice(0, 6);
  }, [pickerHsv, selectedHex]);

  useEffect(() => {
    if (products.length) {
      setCatalogProducts(products);
      setCatalogueState("ready");
      return;
    }

    const controller = new AbortController();
    setCatalogueState("loading");
    const endpointParams = new URLSearchParams({ category: categoryCode });
    if (vendorId) endpointParams.set("vendor", vendorId);
    if (catalogReloadKey) endpointParams.set("retry", String(catalogReloadKey));
    const endpoint = `/api/color-finder/catalog?${endpointParams.toString()}`;

    void fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      cache: catalogReloadKey ? "no-store" : "default",
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Color Finder catalogue request failed: ${response.status}`);
        return await response.json() as { products?: ColorFinderProduct[]; degraded?: boolean };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const nextProducts = Array.isArray(payload.products) ? payload.products : [];
        setCatalogProducts(nextProducts);
        setCatalogueState(payload.degraded || nextProducts.length === 0 ? "degraded" : "ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("Color Finder catalogue load degraded", error);
        setCatalogueState("degraded");
      });

    return () => controller.abort();
  }, [catalogReloadKey, categoryCode, products, vendorId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const color = normalizeHex(params.get("color") ?? "");
    const finishParam = params.get("finish");
    const typeParam = params.get("type");
    const brandParam = params.get("brand");
    const sortParam = params.get("sort");

    if (color) {
      setSelectedHex(color);
      setHexDraft(color);
    }
    if (context.showFinishFilter && finishParam && finishParam in FINISH_LABELS) setFinish(finishParam as ColorFinish);
    if (context.showTypeFilter && typeParam && typeParam in TYPE_LABELS) setProductType(typeParam as ColorProductType);
    if (brandParam?.trim()) setBrand(brandParam.trim());
    if (sortParam === "price-asc" || sortParam === "price-desc") setSortMode(sortParam);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("color", selectedHex.slice(1).toLowerCase());
    if (!context.showFinishFilter || finish === "all") url.searchParams.delete("finish");
    else url.searchParams.set("finish", finish);
    if (!context.showTypeFilter || productType === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", productType);
    if (brand === "all") url.searchParams.delete("brand");
    else url.searchParams.set("brand", brand);
    if (sortMode === "match") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sortMode);
    window.history.replaceState(window.history.state, "", url);
  }, [brand, context.showFinishFilter, context.showTypeFilter, finish, productType, selectedHex, sortMode, urlReady]);

  useEffect(() => {
    setPickerHsv(hexToHsv(selectedHex));
  }, [selectedHex]);

  useEffect(() => {
    setVisibleLimit(24);
  }, [brand, finish, productType, selectedHex, sortMode]);

  useEffect(() => {
    if (!photoUrl) return undefined;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (!photoSpot || photoPickMode !== "spot") return;
    const source = canvasRef.current;
    const loupe = loupeCanvasRef.current;
    if (!source || !loupe) return;

    const context = loupe.getContext("2d");
    if (!context) return;
    const sourceSize = 24;
    const half = sourceSize / 2;
    const sx = clamp(photoSpot.x - half, 0, PHOTO_CANVAS_WIDTH - sourceSize);
    const sy = clamp(photoSpot.y - half, 0, PHOTO_CANVAS_HEIGHT - sourceSize);

    context.clearRect(0, 0, loupe.width, loupe.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      Math.floor(sx),
      Math.floor(sy),
      sourceSize,
      sourceSize,
      0,
      0,
      loupe.width,
      loupe.height
    );
  }, [photoPickMode, photoSpot]);

  useEffect(() => {
    if (!photoExpiresAt) {
      setPhotoSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((photoExpiresAt - Date.now()) / 1000));
      setPhotoSecondsLeft(seconds);
      if (seconds > 0) return;

      setPhotoUrl(undefined);
      setPhotoExpiresAt(undefined);
      setPhotoRect(undefined);
      setCrop(undefined);
      setPhotoReady(false);
      setPhotoSampleHex(undefined);
      setPhotoSpot(undefined);
      setPhotoError(undefined);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [photoExpiresAt]);

  useEffect(() => {
    if (!photoUrl) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    setPhotoReady(false);
    setPhotoError(undefined);
    setPhotoSampleHex(undefined);

    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !image.naturalWidth || !image.naturalHeight) {
        setPhotoError("Δεν μπορέσαμε να διαβάσουμε αυτή τη φωτογραφία.");
        return;
      }

      canvas.width = PHOTO_CANVAS_WIDTH;
      canvas.height = PHOTO_CANVAS_HEIGHT;
      context.clearRect(0, 0, PHOTO_CANVAS_WIDTH, PHOTO_CANVAS_HEIGHT);
      context.fillStyle = "#070708";
      context.fillRect(0, 0, PHOTO_CANVAS_WIDTH, PHOTO_CANVAS_HEIGHT);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      const scale = Math.min(
        PHOTO_CANVAS_WIDTH / image.naturalWidth,
        PHOTO_CANVAS_HEIGHT / image.naturalHeight
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const x = Math.round((PHOTO_CANVAS_WIDTH - width) / 2);
      const y = Math.round((PHOTO_CANVAS_HEIGHT - height) / 2);
      context.drawImage(image, x, y, width, height);

      const nextRect = { x, y, width, height };
      const minDimension = Math.min(width, height);
      const size = Math.max(40, minDimension * DEFAULT_CROP_RATIO);
      setPhotoRect(nextRect);
      setCrop({
        x: x + (width - size) / 2,
        y: y + (height - size) / 2,
        size
      });
      setPhotoReady(true);
    };

    image.onerror = () => {
      setPhotoReady(false);
      setPhotoError("Η μορφή της φωτογραφίας δεν υποστηρίζεται από αυτόν τον browser.");
    };

    image.src = photoUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [photoUrl]);

  const cropPercent = useMemo(() => {
    if (!crop || !photoRect) return Math.round(DEFAULT_CROP_RATIO * 100);
    return Math.round((crop.size / Math.min(photoRect.width, photoRect.height)) * 100);
  }, [crop, photoRect]);

  const cropStyle = useMemo<CSSProperties | undefined>(() => {
    if (!crop) return undefined;
    return {
      left: `${(crop.x / PHOTO_CANVAS_WIDTH) * 100}%`,
      top: `${(crop.y / PHOTO_CANVAS_HEIGHT) * 100}%`,
      width: `${(crop.size / PHOTO_CANVAS_WIDTH) * 100}%`,
      height: `${(crop.size / PHOTO_CANVAS_HEIGHT) * 100}%`
    };
  }, [crop]);

  function applyHex(value: string) {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) setSelectedHex(normalized);
  }

  function updatePickerColor(next: HsvColor) {
    const normalized: HsvColor = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1)
    };
    const hex = hsvToHex(normalized);
    setPickerHsv(normalized);
    setSelectedHex(hex);
    setHexDraft(hex);
  }

  function movePickerToPoint(clientX: number, clientY: number, element: HTMLDivElement) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const saturation = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    const value = clamp(1 - ((clientY - bounds.top) / bounds.height), 0, 1);
    updatePickerColor({ ...pickerHsv, s: saturation, v: value });
  }

  function handlePickerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pickerDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    movePickerToPoint(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePickerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pickerDragRef.current) return;
    movePickerToPoint(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePickerPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pickerDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.06 : 0.02;
    if (event.key === "ArrowLeft") updatePickerColor({ ...pickerHsv, s: pickerHsv.s - step });
    else if (event.key === "ArrowRight") updatePickerColor({ ...pickerHsv, s: pickerHsv.s + step });
    else if (event.key === "ArrowUp") updatePickerColor({ ...pickerHsv, v: pickerHsv.v + step });
    else if (event.key === "ArrowDown") updatePickerColor({ ...pickerHsv, v: pickerHsv.v - step });
    else return;
    event.preventDefault();
  }

  function scrollToMatches() {
    document.getElementById("matches")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function shareSelection() {
    const url = window.location.href;
    const title = `KONTA MOY Color Finder · ${selectedShade.label} ${selectedHex}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 1800);
    } catch {
      setShareStatus("idle");
    }
  }

  function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (file.type && !file.type.startsWith("image/")) {
      setPhotoError("Επίλεξε αρχείο εικόνας.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("Η φωτογραφία είναι πολύ μεγάλη. Μέγιστο μέγεθος: 25 MB.");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setSelectorMode("photo");
    setPhotoUrl(nextUrl);
    setPhotoExpiresAt(Date.now() + PHOTO_TTL_MS);
    setPhotoSecondsLeft(PHOTO_TTL_MS / 1000);
    setPhotoRect(undefined);
    setCrop(undefined);
    setPhotoReady(false);
    setPhotoSampleHex(undefined);
    setPhotoPickMode("spot");
    setPhotoSpot(undefined);
    setPhotoError(undefined);
  }

  function clearPhoto() {
    setPhotoUrl(undefined);
    setPhotoExpiresAt(undefined);
    setPhotoRect(undefined);
    setCrop(undefined);
    setPhotoReady(false);
    setPhotoSampleHex(undefined);
    setPhotoSpot(undefined);
    setPhotoError(undefined);
  }

  function samplePhotoSpot(clientX: number, clientY: number, element: HTMLDivElement) {
    const canvas = canvasRef.current;
    if (!canvas || !photoRect || !photoReady) return;

    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const rawX = (clientX - bounds.left) * (PHOTO_CANVAS_WIDTH / bounds.width);
    const rawY = (clientY - bounds.top) * (PHOTO_CANVAS_HEIGHT / bounds.height);
    const x = clamp(rawX, photoRect.x, photoRect.x + photoRect.width - 1);
    const y = clamp(rawY, photoRect.y, photoRect.y + photoRect.height - 1);
    const sampleSize = Math.max(12, Math.round(Math.min(photoRect.width, photoRect.height) * 0.035));
    const sampleX = Math.max(photoRect.x, x - sampleSize / 2);
    const sampleY = Math.max(photoRect.y, y - sampleSize / 2);
    const width = Math.max(1, Math.min(sampleSize, photoRect.x + photoRect.width - sampleX));
    const height = Math.max(1, Math.min(sampleSize, photoRect.y + photoRect.height - sampleY));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const imageData = context.getImageData(
      Math.floor(sampleX),
      Math.floor(sampleY),
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height))
    );
    const detectedHex = representativeHex(imageData.data, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    if (!detectedHex) return;

    setPhotoSpot({ x, y, hex: detectedHex });
    setPhotoSampleHex(detectedHex);
    setSelectedHex(detectedHex);
    setHexDraft(detectedHex);
    setPhotoError(undefined);
  }

  function handlePhotoPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!photoReady) return;
    if (photoPickMode === "area") {
      handleCropPointerDown(event);
      return;
    }
    photoSpotDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    samplePhotoSpot(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePhotoPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (photoPickMode === "area") {
      handleCropPointerMove(event);
      return;
    }
    if (!photoSpotDragRef.current) return;
    samplePhotoSpot(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePhotoPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (photoPickMode === "area") {
      handleCropPointerEnd(event);
      return;
    }
    photoSpotDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveCropToPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || !photoRect) return;

    const bounds = canvas.getBoundingClientRect();
    const pointX = (clientX - bounds.left) * (PHOTO_CANVAS_WIDTH / bounds.width);
    const pointY = (clientY - bounds.top) * (PHOTO_CANVAS_HEIGHT / bounds.height);

    setCrop((current) => {
      if (!current) return current;
      const x = clamp(pointX - current.size / 2, photoRect.x, photoRect.x + photoRect.width - current.size);
      const y = clamp(pointY - current.size / 2, photoRect.y, photoRect.y + photoRect.height - current.size);
      return { ...current, x, y };
    });
    setPhotoSampleHex(undefined);
  }

  function moveCropBy(deltaX: number, deltaY: number) {
    if (!photoRect) return;
    setCrop((current) => {
      if (!current) return current;
      return {
        ...current,
        x: clamp(current.x + deltaX, photoRect.x, photoRect.x + photoRect.width - current.size),
        y: clamp(current.y + deltaY, photoRect.y, photoRect.y + photoRect.height - current.size)
      };
    });
    setPhotoSampleHex(undefined);
  }

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!photoReady) return;
    cropDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveCropToPoint(event.clientX, event.clientY);
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    moveCropToPoint(event.clientX, event.clientY);
  }

  function handleCropPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    cropDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCropKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!photoReady) return;
    const distance = event.shiftKey ? 36 : 12;
    if (event.key === "ArrowLeft") moveCropBy(-distance, 0);
    else if (event.key === "ArrowRight") moveCropBy(distance, 0);
    else if (event.key === "ArrowUp") moveCropBy(0, -distance);
    else if (event.key === "ArrowDown") moveCropBy(0, distance);
    else return;
    event.preventDefault();
  }

  function resizeCrop(percent: number) {
    if (!photoRect) return;
    const minDimension = Math.min(photoRect.width, photoRect.height);
    const size = minDimension * clamp(percent / 100, MIN_CROP_RATIO, MAX_CROP_RATIO);

    setCrop((current) => {
      if (!current) {
        return {
          x: photoRect.x + (photoRect.width - size) / 2,
          y: photoRect.y + (photoRect.height - size) / 2,
          size
        };
      }
      const centerX = current.x + current.size / 2;
      const centerY = current.y + current.size / 2;
      return {
        x: clamp(centerX - size / 2, photoRect.x, photoRect.x + photoRect.width - size),
        y: clamp(centerY - size / 2, photoRect.y, photoRect.y + photoRect.height - size),
        size
      };
    });
    setPhotoSampleHex(undefined);
  }

  function useSelectedPhotoColor() {
    const canvas = canvasRef.current;
    if (!canvas || !crop || !photoReady) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο χρώμα.");
      return;
    }

    try {
      const x = Math.max(0, Math.floor(crop.x));
      const y = Math.max(0, Math.floor(crop.y));
      const width = Math.max(1, Math.min(PHOTO_CANVAS_WIDTH - x, Math.round(crop.size)));
      const height = Math.max(1, Math.min(PHOTO_CANVAS_HEIGHT - y, Math.round(crop.size)));
      const imageData = context.getImageData(x, y, width, height);
      const detectedHex = representativeHex(imageData.data, width, height);

      if (!detectedHex) {
        setPhotoError("Δεν βρέθηκε αρκετό χρωματικό δείγμα μέσα στο πλαίσιο.");
        return;
      }

      setSelectedHex(detectedHex);
      setHexDraft(detectedHex);
      setPhotoSampleHex(detectedHex);
      setPhotoError(undefined);
      window.requestAnimationFrame(scrollToMatches);
    } catch {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο σημείο.");
    }
  }

  return (
    <div className={styles.experience}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>COLOR FINDER · {context.editionLabel}</span>
          <h1>{context.heroLead}<br /><em>{context.heroEmphasis}</em></h1>
          <p>{context.heroBody}</p>
          <div className={styles.signature}>
            <span>Perceptual matching</span>
            <span aria-hidden="true">·</span>
            <span>CIE LAB / ΔE2000</span>
          </div>
        </div>

        <div className={styles.selectorCard}>
          <div className={styles.selectorHeading}>
            <span>YOUR COLOR</span>
            <strong>{selectedHex}</strong>
          </div>

          <div className={styles.modeSwitch} aria-label="Τρόπος επιλογής χρώματος">
            <button
              type="button"
              className={selectorMode === "picker" ? styles.activeMode : undefined}
              aria-pressed={selectorMode === "picker"}
              onClick={() => setSelectorMode("picker")}
            >
              COLOR
            </button>
            <button
              type="button"
              className={selectorMode === "photo" ? styles.activeMode : undefined}
              aria-pressed={selectorMode === "photo"}
              onClick={() => setSelectorMode("photo")}
            >
              PHOTO
            </button>
          </div>

          {selectorMode === "picker" ? (
            <div className={styles.inlinePicker}>
              <div
                className={styles.svPicker}
                style={{ "--picker-hue": `hsl(${pickerHsv.h} 100% 50%)` } as CSSProperties}
                role="slider"
                tabIndex={0}
                aria-label="Διάλεξε απόχρωση και ένταση"
                aria-valuetext={`${selectedShade.label} ${selectedHex}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pickerHsv.s * 100)}
                onKeyDown={handlePickerKeyDown}
                onPointerDown={handlePickerPointerDown}
                onPointerMove={handlePickerPointerMove}
                onPointerUp={handlePickerPointerEnd}
                onPointerCancel={handlePickerPointerEnd}
              >
                <span
                  className={styles.pickerThumb}
                  style={{
                    left: `${pickerHsv.s * 100}%`,
                    top: `${(1 - pickerHsv.v) * 100}%`,
                    backgroundColor: selectedHex
                  }}
                  aria-hidden="true"
                />
              </div>

              <div className={styles.pickerControls}>
                <div className={styles.pickerPreview}>
                  <span style={{ backgroundColor: selectedHex }} aria-hidden="true" />
                  <div>
                    <small>{selectedShade.label.toUpperCase()}</small>
                    <strong>{selectedHex}</strong>
                  </div>
                </div>

                <label className={styles.hueControl}>
                  <span>HUE</span>
                  <input
                    aria-label="Hue"
                    type="range"
                    min="0"
                    max="359"
                    step="1"
                    value={Math.round(pickerHsv.h)}
                    onChange={(event) => updatePickerColor({
                      ...pickerHsv,
                      h: Number(event.target.value)
                    })}
                  />
                </label>

                <div className={styles.fineTune}>
                  <span>FINE TUNE</span>
                  <div>
                    {fineTuneColors.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Δοκίμασε ${nearestColorName(hex).label} ${hex}`}
                        title={`${nearestColorName(hex).label} · ${hex}`}
                        style={{ backgroundColor: hex }}
                        onClick={() => {
                          setSelectedHex(hex);
                          setHexDraft(hex);
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className={styles.pickerActions}>
                  <button type="button" onClick={scrollToMatches}>SHOW MATCHES</button>
                  <button type="button" onClick={shareSelection}>{shareStatus === "copied" ? "LINK COPIED" : "SHARE SHADE"}</button>
                </div>

                <p className={styles.pickerHint}>Tap or drag anywhere in the color field. No popup, no confirmation.</p>
              </div>
            </div>
          ) : photoUrl ? (
            <div className={styles.photoEditor}>
              <div className={styles.photoPickSwitch} aria-label="Τρόπος επιλογής από φωτογραφία">
                <button
                  type="button"
                  className={photoPickMode === "spot" ? styles.activePhotoPickMode : undefined}
                  onClick={() => {
                    setPhotoPickMode("spot");
                    setPhotoSampleHex(photoSpot?.hex);
                  }}
                >
                  TAP / SPOT
                </button>
                <button
                  type="button"
                  className={photoPickMode === "area" ? styles.activePhotoPickMode : undefined}
                  onClick={() => {
                    setPhotoPickMode("area");
                    setPhotoSampleHex(undefined);
                  }}
                >
                  AREA
                </button>
              </div>
              <div
                className={styles.photoCanvasWrap}
                tabIndex={0}
                aria-label={photoPickMode === "spot"
                  ? "Πάτησε ή σύρε πάνω στο ακριβές χρώμα που θέλεις."
                  : "Μετακίνησε το πλαίσιο πάνω στην περιοχή χρώματος που θέλεις. Μπορείς επίσης να χρησιμοποιήσεις τα βελάκια."}
                onPointerDown={handlePhotoPointerDown}
                onPointerMove={handlePhotoPointerMove}
                onPointerUp={handlePhotoPointerEnd}
                onPointerCancel={handlePhotoPointerEnd}
                onKeyDown={photoPickMode === "area" ? handleCropKeyDown : undefined}
              >
                <canvas ref={canvasRef} width={PHOTO_CANVAS_WIDTH} height={PHOTO_CANVAS_HEIGHT} />
                {photoReady && photoPickMode === "area" && cropStyle ? (
                  <div className={styles.photoCropBox} style={cropStyle} aria-hidden="true">
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                  </div>
                ) : null}
                {photoReady && photoPickMode === "spot" && photoSpot ? (
                  <div
                    className={[
                      styles.photoSpotMarker,
                      photoSpot.y > PHOTO_CANVAS_HEIGHT * 0.72 ? styles.photoSpotMarkerUp : ""
                    ].filter(Boolean).join(" ")}
                    style={{
                      left: `${(photoSpot.x / PHOTO_CANVAS_WIDTH) * 100}%`,
                      top: `${(photoSpot.y / PHOTO_CANVAS_HEIGHT) * 100}%`,
                      "--spot-color": photoSpot.hex
                    } as CSSProperties}
                    aria-hidden="true"
                  >
                    <canvas ref={loupeCanvasRef} width={96} height={96} />
                    <span className={styles.photoSpotCrosshair} />
                    <strong>{photoSpot.hex}</strong>
                  </div>
                ) : null}
              </div>

              <div className={styles.photoEditorMeta}>
                <span>{photoPickMode === "spot" ? "TAP OR DRAG OVER THE EXACT COLOR" : "DRAG THE FRAME OVER THE COLOR AREA"}</span>
                <strong>AUTO-CLEAR {formatCountdown(photoSecondsLeft)}</strong>
              </div>

              <div className={styles.photoControls}>
                {photoPickMode === "area" ? (
                  <label className={styles.cropSizeControl}>
                    <span>Μέγεθος επιλογής</span>
                    <input
                      aria-label="Μέγεθος περιοχής επιλογής"
                      type="range"
                      min={MIN_CROP_RATIO * 100}
                      max={MAX_CROP_RATIO * 100}
                      step="1"
                      value={cropPercent}
                      disabled={!photoReady}
                      onChange={(event) => resizeCrop(Number(event.target.value))}
                    />
                    <strong>{cropPercent}%</strong>
                  </label>
                ) : null}

                {photoSampleHex ? (
                  <div className={styles.detectedColor}>
                    <span style={{ backgroundColor: photoSampleHex }} />
                    <div>
                      <small>{nearestColorName(photoSampleHex).label.toUpperCase()} · PHOTO</small>
                      <strong>{photoSampleHex}</strong>
                    </div>
                  </div>
                ) : null}

                <div className={styles.photoToolbar}>
                  <button
                    type="button"
                    className={styles.photoAction}
                    disabled={photoPickMode === "spot" ? !photoSampleHex : !photoReady}
                    onClick={photoPickMode === "spot" ? scrollToMatches : useSelectedPhotoColor}
                  >
                    {photoPickMode === "spot" ? "SHOW MATCHES" : "USE COLOR & SHOW MATCHES"}
                  </button>
                  <label className={styles.photoGhostAction}>
                    NEW PHOTO
                    <input
                      className={styles.photoFileInput}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFile}
                    />
                  </label>
                </div>

                <div className={styles.photoToolbarSecondary}>
                  <label className={styles.photoGhostAction}>
                    CAMERA
                    <input
                      className={styles.photoFileInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFile}
                    />
                  </label>
                  <button type="button" className={styles.photoDeleteAction} onClick={clearPhoto}>
                    DELETE NOW
                  </button>
                </div>

                {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
                <p className={styles.privacyNote}>
                  Η φωτογραφία δεν ανεβαίνει στο ΚΟΝΤΑ ΜΟΥ και δεν αποθηκεύεται σε λογαριασμό, βάση δεδομένων ή analytics. Μένει μόνο προσωρινά στον browser και διαγράφεται αυτόματα σε έως 15 λεπτά.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.photoEmpty}>
              <span className={styles.photoKicker}>{context.photoKicker}</span>
              <h3>{context.photoTitle}</h3>
              <p>{context.photoBody} Για υφές ή επιφάνειες με μικρές διακυμάνσεις, χρησιμοποίησε το AREA για πιο σταθερό μέσο χρώμα.</p>

              <div className={styles.photoActions}>
                <label className={styles.photoAction}>
                  TAKE A PHOTO
                  <input
                    className={styles.photoFileInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoFile}
                  />
                </label>
                <label className={styles.photoGhostAction}>
                  UPLOAD PHOTO
                  <input
                    className={styles.photoFileInput}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFile}
                  />
                </label>
              </div>

              {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
              <p className={styles.privacyNote}>
                Privacy by design: καμία φωτογραφία δεν φεύγει από τη συσκευή. Δεν γίνεται μόνιμη αποθήκευση και το προσωρινό τοπικό αντικείμενο λήγει σε 15 λεπτά ή νωρίτερα αν πατήσεις διαγραφή. Για πιο πιστό χρώμα προτίμησε φυσικό φως και φωτογραφία χωρίς φίλτρα.
              </p>
            </div>
          )}

          <details className={styles.mobileAdvanced}>
            <summary>MORE OPTIONS</summary>
            <div className={styles.mobileAdvancedBody}>
              {selectorMode === "picker" ? (
                <div className={styles.mobileFineTune}>
                  <span>FINE TUNE</span>
                  <div>
                    {fineTuneColors.map((hex) => (
                      <button
                        key={`mobile-${hex}`}
                        type="button"
                        aria-label={`Δοκίμασε ${nearestColorName(hex).label} ${hex}`}
                        title={`${nearestColorName(hex).label} · ${hex}`}
                        style={{ backgroundColor: hex }}
                        onClick={() => {
                          setSelectedHex(hex);
                          setHexDraft(hex);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.mobileHexField}>
                <label htmlFor="color-finder-hex-mobile">HEX</label>
                <input
                  id="color-finder-hex-mobile"
                  value={hexDraft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => applyHex(event.target.value)}
                  onBlur={() => setHexDraft(selectedHex)}
                />
              </div>

              <div className={styles.mobilePresetRail} aria-label="Προτεινόμενες αποχρώσεις">
                {COLOR_FINDER_PRESETS.map((preset) => (
                  <button
                    key={`mobile-${preset.hex}`}
                    type="button"
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={selectedHex === preset.hex}
                    style={{ backgroundColor: preset.hex }}
                    onClick={() => {
                      setSelectedHex(preset.hex);
                      setHexDraft(preset.hex);
                    }}
                  />
                ))}
              </div>

              <button type="button" className={styles.mobileShare} onClick={shareSelection}>
                {shareStatus === "copied" ? "LINK COPIED" : "SHARE SHADE"}
              </button>
            </div>
          </details>

          <div className={styles.hexField}>
            <label htmlFor="color-finder-hex">HEX</label>
            <input
              id="color-finder-hex"
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => applyHex(event.target.value)}
              onBlur={() => setHexDraft(selectedHex)}
            />
          </div>
          <div className={styles.presetRail} aria-label="Προτεινόμενες αποχρώσεις">
            {COLOR_FINDER_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={selectedHex === preset.hex}
                className={styles.preset}
                style={{ backgroundColor: preset.hex }}
                onClick={() => {
                  setSelectedHex(preset.hex);
                  setHexDraft(preset.hex);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.resultsSection} id="matches" aria-labelledby="color-finder-results">
        <div className={styles.resultsHeader}>
          <div>
            <span className={styles.eyebrow}>{context.resultsEyebrow}</span>
            <h2 id="color-finder-results">{context.resultsTitle}</h2>
            <p aria-live="polite">
              {visibleMatches.length
                ? `${context.resultsBody} ${visibleMatches.length} από ${matches.length} αξιόπιστα αποτελέσματα με τουλάχιστον ${MIN_MATCH_PERCENT}% αντιστοιχία, ${sortMode === "match" ? "ταξινομημένα από το κοντινότερο χρώμα" : sortMode === "price-asc" ? "με χαμηλότερη τιμή πρώτα" : "με υψηλότερη τιμή πρώτα"}.`
                : `Δεν βρέθηκαν ${context.productPlural} με τουλάχιστον ${MIN_MATCH_PERCENT}% χρωματική αντιστοιχία και επαρκή ποιότητα χρωματικών δεδομένων για αυτόν τον συνδυασμό φίλτρων.`}
            </p>
          </div>
          <div className={styles.targetChip}>
            <span style={{ backgroundColor: selectedHex }} />
            <div>
              <small>{selectedShade.label}</small>
              <strong>{selectedHex}</strong>
            </div>
          </div>
        </div>

        <div className={[styles.filters, !context.showTypeFilter && !context.showFinishFilter ? styles.filtersCompact : ""].filter(Boolean).join(" ")}>
          {context.showTypeFilter ? <div className={styles.filterGroup}>
            <span>TYPE</span>
            <div>
              <button type="button" className={productType === "all" ? styles.activeFilter : undefined} onClick={() => setProductType("all")}>
                All <small>{eligibleProducts.filter((product) =>
                  (finish === "all" || product.finish === finish)
                  && (brand === "all" || product.brand === brand)
                ).length}</small>
              </button>
              {availableTypes.map((type) => (
                <button key={type} type="button" className={productType === type ? styles.activeFilter : undefined} onClick={() => setProductType(type)}>
                  {TYPE_LABELS[type]} <small>{typeCounts.get(type) ?? 0}</small>
                </button>
              ))}
            </div>
          </div> : null}
          {context.showFinishFilter ? <div className={styles.filterGroup}>
            <span>FINISH</span>
            <div>
              <button type="button" className={finish === "all" ? styles.activeFilter : undefined} onClick={() => setFinish("all")}>
                All <small>{eligibleProducts.filter((product) =>
                  (productType === "all" || product.productType === productType)
                  && (brand === "all" || product.brand === brand)
                ).length}</small>
              </button>
              {availableFinishes.map((item) => (
                <button key={item} type="button" className={finish === item ? styles.activeFilter : undefined} onClick={() => setFinish(item)}>
                  {FINISH_LABELS[item]} <small>{finishCounts.get(item) ?? 0}</small>
                </button>
              ))}
            </div>
          </div> : null}
          <div className={styles.filterGroup}>
            <span>BRAND</span>
            <select
              className={styles.filterSelect}
              aria-label="Brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            >
              <option value="all">
                All brands ({eligibleProducts.filter((product) =>
                  (finish === "all" || product.finish === finish)
                  && (productType === "all" || product.productType === productType)
                ).length})
              </option>
              {availableBrands.map((name) => (
                <option value={name} key={name}>{name} ({brandCounts.get(name) ?? 0})</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <span>SORT</span>
            <div>
              <button type="button" className={sortMode === "match" ? styles.activeFilter : undefined} onClick={() => setSortMode("match")}>Best match</button>
              <button type="button" className={sortMode === "price-asc" ? styles.activeFilter : undefined} onClick={() => setSortMode("price-asc")}>Price ↑</button>
              <button type="button" className={sortMode === "price-desc" ? styles.activeFilter : undefined} onClick={() => setSortMode("price-desc")}>Price ↓</button>
            </div>
          </div>
        </div>

        {visibleMatches.length ? (
          <>
            <div className={styles.grid}>
              {visibleMatches.map((product, index) => (
                <article className={styles.productCard} key={product.id}>
                  <Link className={styles.imageWrap} href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>
                    <span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span>
                    <img src={product.imageSrc} alt={product.mediaAlt ?? product.title} loading={index < 4 ? "eager" : "lazy"} decoding="async" />
                  </Link>
                  <div className={styles.productBody}>
                    <div className={styles.brandRow}>
                      <span>{product.brand ?? "KONTA MOY"}</span>
                      <strong>{product.match}% <small>{matchQualityLabel(product.match)}</small></strong>
                    </div>
                    <h3><Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>{product.title}</Link></h3>
                    {product.brandShade || product.shadeCode ? (
                      <p className={styles.shadeName}>
                        {[product.shadeCode, product.brandShade].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {product.profilePrecision ? (
                      <p className={styles.profileNote}>
                        {product.profilePrecision === "exact"
                          ? "Verified colour profile"
                          : product.profilePrecision === "canonicalized"
                            ? ["nails", "lips", "eyes", "makeup"].includes(context.key)
                              ? "Canonicalized brand shade"
                              : "Canonicalized product color"
                            : "Approximate colour family"}
                        {typeof product.profileConfidence === "number" ? ` · ${Math.round(product.profileConfidence * 100)}% confidence` : ""}
                      </p>
                    ) : null}
                    <div className={styles.swatches}>
                      <div>
                        <span style={{ backgroundColor: product.colorHex }} />
                        <small>{product.profilePrecision === "exact" ? "PRODUCT" : "PROFILE"}</small>
                      </div>
                      <div>
                        <span style={{ backgroundColor: selectedHex }} />
                        <small>YOUR COLOR</small>
                      </div>
                      <p>ΔE {product.deltaE.toFixed(1)}</p>
                    </div>
                    <div className={styles.cardFooter}>
                      <div>
                        <span>{context.showFinishFilter ? FINISH_LABELS[product.finish] : product.colorLabel}</span>
                        <strong>{product.price}</strong>
                      </div>
                      <Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>View product →</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {visibleMatches.length < matches.length ? (
              <div className={styles.moreMatches}>
                <button type="button" onClick={() => setVisibleLimit((current) => current + 24)}>
                  SHOW MORE MATCHES
                </button>
                <span>{matches.length - visibleMatches.length} more ≥ {MIN_MATCH_PERCENT}%</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptySwatch} style={{ backgroundColor: selectedHex }} />
            <h3>
              {catalogueState === "loading"
                ? "Loading color matches…"
                : catalogueAvailable
                  ? `We are still learning this color in ${context.categoryLabel}.`
                  : `${context.studioLabel} matching is refreshing.`}
            </h3>
            <p>
              {catalogueState === "loading"
                ? <>Ο Color Finder είναι ήδη διαθέσιμος. Φορτώνουμε τα χρωματικά προφίλ προϊόντων στο παρασκήνιο.</>
                : catalogueAvailable
                  ? <>Εμφανίζουμε μόνο {context.productPlural} με τουλάχιστον {MIN_MATCH_PERCENT}% χρωματική αντιστοιχία και επαρκή ποιότητα χρωματικών δεδομένων. Δοκίμασε μια κοντινή απόχρωση{context.showFinishFilter ? " ή διαφορετικό finish" : ""}.</>
                  : <>Μπορείς να συνεχίσεις να διαλέγεις ή να παίρνεις χρώμα από φωτογραφία. Τα προϊόντα θα εμφανιστούν μόλις ανανεωθεί ξανά ο κατάλογος αντιστοίχισης.</>}
            </p>
            {catalogueState === "degraded" ? (
              <button
                type="button"
                className={styles.emptyReset}
                onClick={() => setCatalogReloadKey(Date.now())}
              >
                RETRY MATCHES
              </button>
            ) : finish !== "all" || productType !== "all" || brand !== "all" ? (
              <button
                type="button"
                className={styles.emptyReset}
                onClick={() => {
                  setFinish("all");
                  setProductType("all");
                  setBrand("all");
                }}
              >
                RESET FILTERS
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function representativeHex(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | undefined {
  const sampleTarget = 12_000;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / sampleTarget)));
  const samples: Array<readonly [number, number, number]> = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 200) continue;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }

  if (!samples.length) return undefined;

  const red = samples.map((sample) => sample[0]).sort((a, b) => a - b);
  const green = samples.map((sample) => sample[1]).sort((a, b) => a - b);
  const blue = samples.map((sample) => sample[2]).sort((a, b) => a - b);
  const medianIndex = Math.floor(samples.length / 2);
  const median = [red[medianIndex], green[medianIndex], blue[medianIndex]] as const;

  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let accepted = 0;
  const maxDistanceSquared = 95 * 95;

  for (const [r, g, b] of samples) {
    const distanceSquared =
      (r - median[0]) ** 2 +
      (g - median[1]) ** 2 +
      (b - median[2]) ** 2;
    if (distanceSquared > maxDistanceSquared) continue;
    totalRed += r;
    totalGreen += g;
    totalBlue += b;
    accepted += 1;
  }

  if (accepted < Math.min(20, Math.ceil(samples.length * 0.04))) {
    return rgbToHex(median[0], median[1], median[2]);
  }

  return rgbToHex(
    Math.round(totalRed / accepted),
    Math.round(totalGreen / accepted),
    Math.round(totalBlue / accepted)
  );
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


function hexToHsv(hex: string): HsvColor {
  const normalized = normalizeHex(hex) ?? "#000000";
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

function hsvToHex(color: HsvColor): string {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clamp(color.s, 0, 1);
  const value = clamp(color.v, 0, 1);
  const chroma = value * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, x];
  else if (segment < 2) [red, green] = [x, chroma];
  else if (segment < 3) [green, blue] = [chroma, x];
  else if (segment < 4) [green, blue] = [x, chroma];
  else if (segment < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];

  const match = value - chroma;
  return rgbToHex(
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255)
  );
}


function matchQualityLabel(match: number): string {
  if (match >= 85) return "EXCELLENT";
  if (match >= 70) return "VERY CLOSE";
  if (match >= 60) return "CLOSE";
  return "MATCH";
}
