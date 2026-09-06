"use client";

import { useEffect, useRef, useState } from "react";
import { hasUsablePublicCoordinates } from "../lib/public-data-integrity";
import styles from "./VendorStorefront.module.css";

type Coordinates = Readonly<{ latitude: number; longitude: number }>;
type GoogleMapInstance = Record<string, unknown>;
type GoogleMarkerInstance = { setMap(map: GoogleMapInstance | null): void };
type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options?: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options?: Record<string, unknown>) => GoogleMarkerInstance;
};
type GoogleMapsWindow = Window & typeof globalThis & {
  google?: { maps?: GoogleMapsNamespace };
  __blsVendorGoogleMapsPromise?: Promise<GoogleMapsNamespace>;
};

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  const browser = window as GoogleMapsWindow;
  if (browser.google?.maps) return Promise.resolve(browser.google.maps);
  if (browser.__blsVendorGoogleMapsPromise) return browser.__blsVendorGoogleMapsPromise;

  browser.__blsVendorGoogleMapsPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const finish = () => browser.google?.maps
      ? resolve(browser.google.maps)
      : reject(new Error("Google Maps did not initialise"));
    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-google-maps="true"]');

    if (existing) {
      if (browser.google?.maps) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.blsGoogleMaps = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
    document.head.appendChild(script);
  });

  return browser.__blsVendorGoogleMapsPromise;
}

export function VendorLocationMap({ vendorName, address, coordinates }: {
  vendorId: string;
  vendorName: string;
  address: string;
  coordinates?: Coordinates;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const usableCoordinates = hasUsablePublicCoordinates(coordinates) ? coordinates : undefined;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
  const mapQuery = usableCoordinates
    ? `${usableCoordinates.latitude},${usableCoordinates.longitude}`
    : [vendorName, address].filter(Boolean).join(", ");
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;

  useEffect(() => {
    if (!usableCoordinates || !elementRef.current) return undefined;
    if (!apiKey) {
      setFailed(true);
      return undefined;
    }

    let cancelled = false;
    let marker: GoogleMarkerInstance | undefined;

    loadGoogleMaps(apiKey)
      .then((googleMaps) => {
        if (cancelled || !elementRef.current) return;
        const point = { lat: usableCoordinates.latitude, lng: usableCoordinates.longitude };
        const map = new googleMaps.Map(elementRef.current, {
          center: point,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: true
        });
        marker = new googleMaps.Marker({
          map,
          position: point,
          title: vendorName
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [apiKey, usableCoordinates, vendorName]);

  if (!usableCoordinates || failed) {
    return (
      <div className={styles.mapCard}>
        <div className={styles.mapFallback}>
          <div>
            <h3>{vendorName}</h3>
            <p>{usableCoordinates
              ? "Ο διαδραστικός χάρτης Google Maps δεν μπόρεσε να φορτώσει μέσα στη σελίδα."
              : "Δεν υπάρχουν ακόμη επαληθευμένες συντεταγμένες για αυτό το κατάστημα."} Η φυσική διεύθυνση παραμένει διαθέσιμη στα στοιχεία καταστήματος.</p>
            <a className="button button-secondary" href={mapHref} target="_blank" rel="noopener noreferrer">Άνοιξε στο Google Maps</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapCard}>
      <div ref={elementRef} className={styles.mapCanvas} aria-label={`Google Maps χάρτης φυσικού καταστήματος ${vendorName}`} />
      <div className={styles.mapOverlay}>
        <div>
          <strong>{vendorName}</strong>
          <span>{address}</span>
        </div>
        <a className={styles.mapLink} href={mapHref} target="_blank" rel="noopener noreferrer">Άνοιξε στο Google Maps →</a>
      </div>
    </div>
  );
}
