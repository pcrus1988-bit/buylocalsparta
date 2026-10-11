/**
 * Public HUB identity has two independent activation levels:
 * - marketplace: local shopping/checkout infrastructure is live
 * - directory: at least one verified CLAIM business has published its presence
 * Never elevate a CLAIM directory to marketplace-capable status.
 */
export type PublicHubAvailability = "active" | "directory" | "preparing" | "planned";

export type PublicHubRuntimeInput = Readonly<{
  lifecycleState: "inactive" | "prospect" | "active";
  isLive: boolean;
  hasClaimPresence?: boolean;
}>;

export function publicHubAvailability(runtime?: PublicHubRuntimeInput): PublicHubAvailability {
  if (runtime?.lifecycleState === "active" && runtime.isLive) return "active";
  if (runtime?.hasClaimPresence === true) return "directory";
  if (runtime?.lifecycleState === "prospect") return "preparing";
  return "planned";
}
