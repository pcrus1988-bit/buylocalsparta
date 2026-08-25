"use client";

import { useEffect, useState } from "react";
import type { DeliveryJobView } from "../lib/delivery-driver-runtime";
import type { DeliveryLiveLocation } from "../lib/delivery-customer-live";
import { DeliveryLiveFleetMap } from "./DeliveryLiveFleetMap";
import live from "./CustomerDeliveryLiveMap.module.css";
import styles from "./DeliveryOperations.module.css";

function freshness(receivedAt?: number): string {
  if (!receivedAt) return "Αναμονή GPS";
  const seconds = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000));
  if (seconds < 15) return "Live · μόλις τώρα";
  if (seconds < 60) return `Live · πριν ${seconds}″`;
  return `Τελευταία θέση · πριν ${Math.floor(seconds / 60)}′`;
}

export function CustomerDeliveryLiveMap({
  jobId,
  initialLocation,
}: {
  jobId: string;
  initialLocation?: DeliveryLiveLocation;
}) {
  const [location, setLocation] = useState<DeliveryLiveLocation | undefined>(initialLocation);
  const [liveTracking, setLiveTracking] = useState(true);
  const [status, setStatus] = useState("in_progress");

  useEffect(() => {
    if (initialLocation) setLocation(initialLocation);
  }, [initialLocation?.latitude, initialLocation?.longitude, initialLocation?.receivedAt]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/account/delivery", { cache: "no-store" });
        if (!response.ok || !active) return;
        const body = await response.json() as { jobs: DeliveryJobView[] };
        const job = body.jobs.find((item) => item.id === jobId);
        if (!job || !active) return;
        setLiveTracking(job.liveTracking);
        setStatus(job.status);
        if (job.latestLocation) setLocation(job.latestLocation);
      } catch {
        // Keep the latest trusted position visible through transient connectivity issues.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [jobId]);

  if (!liveTracking || status === "completed") {
    return (
      <div className={live.empty}>
        <strong>{status === "completed" ? "Η παράδοση ολοκληρώθηκε" : "Live tracking ανενεργό"}</strong>
        <span>{status === "completed" ? "Η ζωντανή θέση σταμάτησε μετά την επιβεβαίωση παράδοσης." : "Ο οδηγός δεν έχει ενεργοποιήσει ακόμη την κοινοποίηση θέσης για αυτή την παράδοση."}</span>
      </div>
    );
  }

  if (!location) {
    return (
      <div className={live.empty}>
        <strong>Η διαδρομή προς εσένα δεν έχει ξεκινήσει ακόμη</strong>
        <span>Η ακριβής θέση του οδηγού εμφανίζεται αυτόματα μόλις ολοκληρωθούν οι παραλαβές από τα καταστήματα και ξεκινήσει το τελικό σκέλος προς εσένα.</span>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <DeliveryLiveFleetMap
        title="Live tracking οδηγού"
        points={[{
          id: jobId,
          label: "Ο οδηγός σου",
          latitude: location.latitude,
          longitude: location.longitude,
          receivedAt: location.receivedAt,
          detail: freshness(location.receivedAt),
        }]}
      />
      <div className={styles.location} role="status" aria-live="polite">
        <span>{freshness(location.receivedAt)}</span>
        <span>Ακρίβεια ±{Math.round(location.accuracy ?? 0)}m</span>
      </div>
    </div>
  );
}
