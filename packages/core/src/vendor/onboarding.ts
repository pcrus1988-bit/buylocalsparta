export type VendorOnboardingState =
  | "invited"
  | "application_started"
  | "verification_pending"
  | "catalog_onboarding"
  | "test_ready"
  | "active"
  | "restricted"
  | "suspended"
  | "closed";

const FORWARD: Readonly<Record<VendorOnboardingState, readonly VendorOnboardingState[]>> = {
  invited: ["application_started", "closed"],
  application_started: ["verification_pending", "closed"],
  verification_pending: ["catalog_onboarding", "restricted", "closed"],
  catalog_onboarding: ["test_ready", "restricted", "closed"],
  test_ready: ["active", "restricted", "closed"],
  active: ["restricted", "suspended", "closed"],
  restricted: ["verification_pending", "catalog_onboarding", "test_ready", "active", "suspended", "closed"],
  suspended: ["restricted", "active", "closed"],
  closed: []
};

export type VendorStateTransition = Readonly<{
  from: VendorOnboardingState;
  to: VendorOnboardingState;
  actorId: string;
  reason: string;
  at: number;
}>;

export class VendorOnboardingWorkflow {
  #state: VendorOnboardingState;
  readonly #history: VendorStateTransition[] = [];

  constructor(initial: VendorOnboardingState = "invited") {
    this.#state = initial;
  }

  state(): VendorOnboardingState {
    return this.#state;
  }

  transition(to: VendorOnboardingState, actorId: string, reason: string, at: number): VendorStateTransition {
    if (!actorId.trim()) throw new Error("Actor is required");
    if (!reason.trim()) throw new Error("Transition reason is required");
    if (!FORWARD[this.#state].includes(to)) throw new Error(`Invalid vendor onboarding transition: ${this.#state} -> ${to}`);
    const event: VendorStateTransition = { from: this.#state, to, actorId, reason, at };
    this.#history.push(event);
    this.#state = to;
    return event;
  }

  history(): readonly VendorStateTransition[] {
    return structuredClone(this.#history);
  }
}
