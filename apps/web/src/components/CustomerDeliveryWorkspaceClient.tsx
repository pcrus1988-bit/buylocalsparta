"use client";

import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import type { DeliveryJobView } from "../lib/delivery-driver-runtime";
import { CustomerDeliveryLiveMap } from "./CustomerDeliveryLiveMap";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) {
  return value
    ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "medium" }).format(value)
    : "";
}

function locationFreshness(receivedAt: number | undefined, now: number): string | undefined {
  if (!receivedAt) return undefined;
  const seconds = Math.max(0, Math.floor((now - receivedAt) / 1000));
  if (seconds < 20) return "Live θέση · μόλις τώρα";
  if (seconds < 60) return `Live θέση · πριν ${seconds}″`;
  const minutes = Math.floor(seconds / 60);
  return `Τελευταία θέση · πριν ${minutes}′`;
}

function jobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "Σε προγραμματισμό",
    ready: "Έτοιμη για ανάθεση",
    assigned: "Ανατέθηκε σε οδηγό",
    in_progress: "Σε εξέλιξη",
    completed: "Ολοκληρώθηκε",
    failed: "Πρόβλημα",
    cancelled: "Ακυρώθηκε"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function stopStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Αναμονή",
    ready: "Έτοιμο",
    completed: "Ολοκληρώθηκε",
    skipped: "Παραλείφθηκε",
    failed: "Πρόβλημα"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function customerRouteStage(job: DeliveryJobView, now: number): Readonly<{ title: string; detail: string }> {
  if (job.status === "completed") return { title: "Ολοκληρώθηκε", detail: "Η διαδρομή έχει ολοκληρωθεί." };
  const customerKind = job.type === "outbound" ? "customer_dropoff" : "customer_return_pickup";
  const pending = [...job.stops]
    .filter((stop) => stop.status !== "completed" && stop.status !== "skipped")
    .sort((left, right) => left.sequence - right.sequence);
  const targetIndex = pending.findIndex((stop) => stop.kind === customerKind);
  const stopsBeforeCustomer = targetIndex > 0 ? targetIndex : 0;
  const freshness = locationFreshness(job.latestLocation?.receivedAt, now);

  if (!job.driverId) {
    return {
      title: "Προετοιμασία διαδρομής",
      detail: "Η εργασία δεν έχει ακόμη ενεργό οδηγό. Θα εμφανιστεί πορεία μόλις γίνει ανάθεση."
    };
  }
  if (!job.liveTracking) {
    return {
      title: "Ο οδηγός έχει ανατεθεί",
      detail: `${job.driverName ? `${job.driverName} · ` : ""}Η live θέση θα εμφανιστεί όταν ξεκινήσει η ενεργή διαδρομή.`
    };
  }
  if (targetIndex === 0) {
    return {
      title: job.type === "outbound" ? "Επόμενη στάση: εσύ" : "Επόμενη στάση: παραλαβή από εσένα",
      detail: freshness ?? "Η ενεργή διαδρομή βρίσκεται στο τελικό σκέλος προς το σημείο σου."
    };
  }
  if (targetIndex > 0) {
    return {
      title: `${stopsBeforeCustomer} ${stopsBeforeCustomer === 1 ? "στάση" : "στάσεις"} πριν από εσένα`,
      detail: freshness ?? "Η σειρά προκύπτει από την ενεργή διαδρομή του οδηγού και ενημερώνεται αυτόματα."
    };
  }
  return {
    title: "Η διαδρομή είναι ενεργή",
    detail: freshness ?? "Παρακολούθησε τα ολοκληρωμένα σημεία για την τρέχουσα πρόοδο."
  };
}

export function CustomerDeliveryWorkspaceClient({
  initialJobs,
}: {
  initialJobs: readonly DeliveryJobView[];
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/account/delivery", { cache: "no-store" });
        if (!response.ok || !active) return;
        const body = await response.json() as { jobs: DeliveryJobView[] };
        if (active) {
          setJobs(body.jobs);
          setNow(Date.now());
        }
      } catch {
        // Keep the last successful tracking state during transient connectivity issues.
      }
    };
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!jobs.length) {
    return <div className={styles.empty}>Δεν υπάρχουν ενεργές τοπικές παραδόσεις ή επιστροφές.</div>;
  }

  return (
    <div className={styles.grid}>
      {jobs.map((job) => {
        const routeStage = customerRouteStage(job, now);
        const vendorPickups = job.stops.filter((stop) => stop.kind === "vendor_pickup");
        const vendorPickupsComplete = vendorPickups.length > 0
          && vendorPickups.every((stop) => stop.status === "completed" || stop.status === "skipped");
        const customerDropoffOpen = job.stops.some((stop) => stop.kind === "customer_dropoff"
          && !["completed", "skipped", "failed"].includes(stop.status));
        const showCustomerQr = Boolean(job.customerQr
          && job.driverId
          && job.status === "in_progress"
          && vendorPickupsComplete
          && customerDropoffOpen);
        const showReturnPickupQr = Boolean(job.returnPickupQr
          && job.driverId
          && ["assigned", "in_progress"].includes(job.status));

        return (
          <article className={styles.card} key={job.id}>
            <div className={styles.toolbar}>
              <span className={styles.badge}>{job.type === "outbound" ? "Παράδοση" : "Επιστροφή"}</span>
              <strong>{job.orderId}</strong>
              <span className={styles.status}>{jobStatusLabel(job.status)}</span>
            </div>

            <div className={styles.progress}>
              <span style={{ width: `${job.progress.total ? Math.round(job.progress.completed / job.progress.total * 100) : 0}%` }} />
            </div>
            <p className={styles.muted}>
              {job.progress.completed}/{job.progress.total} σημεία ολοκληρώθηκαν. Οι ενημερώσεις ανανεώνονται αυτόματα.
            </p>

            <div className={styles.stop} role="status" aria-live="polite">
              <span className={styles.stopIndex}>→</span>
              <div>
                <strong>{routeStage.title}</strong>
                <div className={styles.muted}>{routeStage.detail}</div>
              </div>
              <span className={styles.status}>{job.liveTracking ? "live" : "route"}</span>
            </div>

            <div className={styles.stopList}>
              {job.stops.map((stop) => (
                <div
                  className={`${styles.stop} ${stop.status === "completed" ? styles.stopDone : ""}`}
                  key={stop.id}
                >
                  <span className={styles.stopIndex}>{stop.sequence}</span>
                  <div>
                    <strong>
                      {stop.vendorName
                        || (stop.kind === "customer_dropoff"
                          ? "Παράδοση σε εσένα"
                          : stop.kind === "customer_return_pickup"
                            ? "Παραλαβή επιστροφής από εσένα"
                            : stop.kind)}
                    </strong>
                    {stop.completedAt && <div className={styles.muted}>{stamp(stop.completedAt)}</div>}
                  </div>
                  <span className={styles.status}>{stopStatusLabel(stop.status)}</span>
                </div>
              ))}
            </div>

            {job.liveTracking && job.status !== "completed" && (
              <CustomerDeliveryLiveMap
                jobId={job.id}
                initialLocation={job.latestLocation
                  ? {
                      latitude: job.latestLocation.latitude,
                      longitude: job.latestLocation.longitude,
                      accuracy: job.latestLocation.accuracy,
                      receivedAt: job.latestLocation.receivedAt,
                    }
                  : undefined}
              />
            )}

            {job.type === "outbound" && job.status !== "completed" && !showCustomerQr && (
              <div className={styles.notice} role="status">
                Το QR τελικής παράδοσης θα εμφανιστεί όταν ο οδηγός έχει παραλάβει όλα τα τμήματα της παραγγελίας και ξεκινήσει το τελικό σκέλος προς εσένα.
              </div>
            )}

            {showCustomerQr && (
              <div className={styles.qrWrap}>
                <strong>QR επιτυχούς παράδοσης</strong>
                <QRCode value={job.customerQr!} size={220} />
                <span className={styles.muted}>
                  Δείξε αυτό το QR στον οδηγό μόνο όταν έχεις παραλάβει επιτυχώς την παραγγελία. Η σάρωση ολοκληρώνει την παράδοση.
                </span>
              </div>
            )}

            {showReturnPickupQr && (
              <div className={styles.qrWrap}>
                <strong>QR παραλαβής επιστροφής</strong>
                <QRCode value={job.returnPickupQr!} size={220} />
                <span className={styles.muted}>
                  Δείξε το QR στον οδηγό όταν του παραδώσεις τα προϊόντα της επιστροφής.
                </span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
