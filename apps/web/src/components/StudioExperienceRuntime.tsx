"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { StudioDestination } from "../lib/studio-registry";
import { consumeStudioTravel, markStudioTravel } from "../lib/studio-travel";
import styles from "./StudioExperienceRuntime.module.css";

export type StudioQualityTier = "high" | "balanced" | "lite";
type StudioId = StudioDestination["id"];

type RuntimeValue = Readonly<{
  studioId: StudioId;
  qualityTier: StudioQualityTier;
  reducedMotion: boolean;
  entering: boolean;
  exiting: boolean;
  exitToHub: () => void;
}>;

const StudioRuntimeContext = createContext<RuntimeValue | null>(null);

export function detectStudioQualityTier(width: number): StudioQualityTier {
  if (typeof navigator === "undefined") return width <= 640 ? "lite" : "balanced";
  const cores = navigator.hardwareConcurrency || 4;
  if (width <= 640 || cores <= 4) return "lite";
  if (width >= 1180 && cores >= 8) return "high";
  return "balanced";
}

export function StudioHubExitLink({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  const { exitToHub } = useStudioRuntime();
  return (
    <a
      href="/studios"
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        exitToHub();
      }}
    >
      {children}
    </a>
  );
}

export function useStudioRuntime(): RuntimeValue {
  const value = useContext(StudioRuntimeContext);
  if (!value) throw new Error("useStudioRuntime must be used inside StudioExperienceRuntime");
  return value;
}

export function StudioExperienceRuntime({
  studioId,
  children
}: {
  studioId: StudioId;
  children: ReactNode;
}) {
  const router = useRouter();
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qualityTier, setQualityTier] = useState<StudioQualityTier>("balanced");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [entering, setEntering] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    const syncQuality = () => setQualityTier(detectStudioQualityTier(window.innerWidth));

    syncMotion();
    syncQuality();
    media.addEventListener("change", syncMotion);
    window.addEventListener("resize", syncQuality, { passive: true });

    const marker = consumeStudioTravel(studioId);
    if (marker && !media.matches) {
      setEntering(true);
      enterTimerRef.current = setTimeout(() => setEntering(false), 640);
    }

    return () => {
      media.removeEventListener("change", syncMotion);
      window.removeEventListener("resize", syncQuality);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, [studioId]);

  function exitToHub() {
    if (exiting) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    markStudioTravel(studioId, "hub");
    if (reducedMotion) {
      router.push("/studios");
      return;
    }
    setExiting(true);
    exitTimerRef.current = setTimeout(() => router.push("/studios"), 500);
  }

  const value = useMemo<RuntimeValue>(() => ({
    studioId,
    qualityTier,
    reducedMotion,
    entering,
    exiting,
    exitToHub
  }), [entering, exiting, qualityTier, reducedMotion, studioId]);

  return (
    <StudioRuntimeContext.Provider value={value}>
      <div
        className={styles.runtime}
        data-studio={studioId}
        data-quality={qualityTier}
        data-entering={entering || undefined}
        data-exiting={exiting || undefined}
      >
        {children}
        <div className={styles.travelVeil} aria-hidden="true">
          <i /><i /><i /><i />
          <span />
        </div>
      </div>
    </StudioRuntimeContext.Provider>
  );
}
