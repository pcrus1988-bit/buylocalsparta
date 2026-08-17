import { id } from "../common/ids.ts";
import { VendorOnboardingWorkflow, type VendorOnboardingState, type VendorStateTransition } from "./onboarding.ts";

export type VendorApplication = {
  id: string;
  ownerUserId: string;
  marketId: string;
  vendorId?: string;
  legalName: string;
  tradingName: string;
  taxNumber?: string;
  gemiNumber?: string;
  contactEmail: string;
  phone?: string;
  address: string;
  postcode: string;
  primaryCategory: string;
  shopStory?: string;
  requestedPlanCode: string;
  state: VendorOnboardingState;
  verificationNotes?: string;
  createdAt: number;
  updatedAt: number;
  history: VendorStateTransition[];
};

export class VendorRegistry {
  readonly #applications = new Map<string, VendorApplication>();
  readonly #workflows = new Map<string, VendorOnboardingWorkflow>();
  readonly #ownerIndex = new Map<string, string>();

  startApplication(input: {
    ownerUserId: string;
    marketId: string;
    legalName: string;
    tradingName: string;
    contactEmail: string;
    address: string;
    postcode: string;
    primaryCategory: string;
    taxNumber?: string;
    gemiNumber?: string;
    phone?: string;
    shopStory?: string;
    requestedPlanCode?: string;
    now: number;
  }): VendorApplication {
    if (this.#ownerIndex.has(input.ownerUserId)) throw new Error("User already has a vendor application");
    for (const value of [input.legalName, input.tradingName, input.contactEmail, input.address, input.postcode, input.primaryCategory]) {
      if (!value.trim()) throw new Error("Vendor application is missing required information");
    }
    const workflow = new VendorOnboardingWorkflow("invited");
    const initialTransition = workflow.transition("application_started", input.ownerUserId, "merchant started application", input.now);
    const application: VendorApplication = {
      id: id("vapp"),
      ownerUserId: input.ownerUserId,
      marketId: input.marketId,
      legalName: input.legalName.trim(),
      tradingName: input.tradingName.trim(),
      taxNumber: input.taxNumber?.trim() || undefined,
      gemiNumber: input.gemiNumber?.trim() || undefined,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      address: input.address.trim(),
      postcode: input.postcode.trim(),
      primaryCategory: input.primaryCategory.trim(),
      shopStory: input.shopStory?.trim() || undefined,
      requestedPlanCode: input.requestedPlanCode?.trim() || "free_listing",
      state: "application_started",
      createdAt: input.now,
      updatedAt: input.now,
      history: [initialTransition]
    };
    this.#applications.set(application.id, application);
    this.#workflows.set(application.id, workflow);
    this.#ownerIndex.set(application.ownerUserId, application.id);
    return structuredClone(application);
  }

  submit(applicationId: string, ownerUserId: string, now: number): VendorApplication {
    const application = this.#required(applicationId);
    if (application.ownerUserId !== ownerUserId) throw new Error("Vendor application ownership violation");
    if (!application.taxNumber) throw new Error("Tax number is required before verification");
    return this.#transition(application, "verification_pending", ownerUserId, "merchant submitted application", now);
  }

  adminTransition(input: { applicationId: string; to: VendorOnboardingState; actorId: string; reason: string; now: number }): VendorApplication {
    const application = this.#required(input.applicationId);
    const updated = this.#transition(application, input.to, input.actorId, input.reason, input.now);
    if (input.to === "active" && !application.vendorId) {
      application.vendorId = `vendor-${application.id}`;
      application.updatedAt = input.now;
      return structuredClone(application);
    }
    return updated;
  }

  setVerificationNotes(applicationId: string, notes: string, now: number): VendorApplication {
    const application = this.#required(applicationId);
    application.verificationNotes = notes.trim();
    application.updatedAt = now;
    return structuredClone(application);
  }

  get(applicationId: string): VendorApplication | undefined {
    const application = this.#applications.get(applicationId);
    return application ? structuredClone(application) : undefined;
  }

  forOwner(ownerUserId: string): VendorApplication | undefined {
    const applicationId = this.#ownerIndex.get(ownerUserId);
    return applicationId ? this.get(applicationId) : undefined;
  }

  all(): readonly VendorApplication[] {
    return [...this.#applications.values()].map((application) => structuredClone(application));
  }

  #transition(application: VendorApplication, to: VendorOnboardingState, actorId: string, reason: string, now: number): VendorApplication {
    const workflow = this.#workflows.get(application.id)!;
    const event = workflow.transition(to, actorId, reason, now);
    application.state = workflow.state();
    application.updatedAt = now;
    application.history.push(event);
    return structuredClone(application);
  }

  #required(applicationId: string): VendorApplication {
    const application = this.#applications.get(applicationId);
    if (!application) throw new Error("Vendor application not found");
    return application;
  }
}
