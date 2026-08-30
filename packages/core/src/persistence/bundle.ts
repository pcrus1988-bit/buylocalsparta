import type { SqlPool } from "./sql.ts";
import { PostgresCatalogRepository, PostgresInventoryRepository } from "./postgres.ts";
import {
  PostgresAdviceRepository,
  PostgresCommerceRepository,
  PostgresFairnessRepository,
  PostgresFinanceRepository,
  PostgresShippingRepository
} from "./postgres-domains.ts";
import {
  PostgresIdentityRepository,
  PostgresMediaTrustRepository,
  PostgresTrustRepository,
  PostgresVendorRepository
} from "./postgres-identity-trust.ts";
import { PostgresOutboxRepository, PostgresScheduledJobStore, PostgresSearchProjectionRepository, PostgresStockFreshnessRepository } from "./postgres-operations.ts";
import { PostgresCommercialRepository } from "./postgres-commercials.ts";
import { PostgresContentRepository } from "./postgres-content.ts";
import { PostgresAnalyticsRepository } from "./postgres-analytics.ts";
import { PostgresNotificationOperationsRepository } from "./postgres-notifications.ts";
import { PostgresSecurityRepository } from "./postgres-security.ts";
import { PostgresReviewRepository } from "./postgres-reviews.ts";
import { PostgresOrderOperationsRepository } from "./postgres-order-operations.ts";
import { PostgresAvailabilityRepository } from "./postgres-availability.ts";
import { PostgresCategoryGovernanceRepository } from "./postgres-category-governance.ts";
import { PostgresPromotionsRepository } from "./postgres-promotions.ts";
import { PostgresCustomerPrivacyRepository } from "./postgres-privacy.ts";
import { PostgresEngagementRepository } from "./postgres-engagement.ts";
import { PostgresOpenIcecatBulkRepository } from "./postgres-open-icecat-bulk.ts";
import { PostgresOpenIcecatDetailRepository } from "./postgres-open-icecat-detail.ts";

/**
 * One construction point for the production persistence adapters.
 * Domain services remain independent of a particular PostgreSQL driver; callers only
 * need to provide a SqlPool (for example an adapted `pg` Pool in production).
 */
export class PostgresPersistenceBundle {
  readonly catalog: PostgresCatalogRepository;
  readonly inventory: PostgresInventoryRepository;
  readonly fairness: PostgresFairnessRepository;
  readonly commerce: PostgresCommerceRepository;
  readonly advice: PostgresAdviceRepository;
  readonly finance: PostgresFinanceRepository;
  readonly shipping: PostgresShippingRepository;
  readonly identity: PostgresIdentityRepository;
  readonly vendor: PostgresVendorRepository;
  readonly mediaTrust: PostgresMediaTrustRepository;
  readonly trust: PostgresTrustRepository;
  readonly outbox: PostgresOutboxRepository;
  readonly scheduledJobs: PostgresScheduledJobStore;
  readonly searchProjection: PostgresSearchProjectionRepository;
  readonly stockFreshness: PostgresStockFreshnessRepository;
  readonly commercial: PostgresCommercialRepository;
  readonly content: PostgresContentRepository;
  readonly analytics: PostgresAnalyticsRepository;
  readonly notificationOperations: PostgresNotificationOperationsRepository;
  readonly security: PostgresSecurityRepository;
  readonly reviews: PostgresReviewRepository;
  readonly orderOperations: PostgresOrderOperationsRepository;
  readonly availability: PostgresAvailabilityRepository;
  readonly categoryGovernance: PostgresCategoryGovernanceRepository;
  readonly promotions: PostgresPromotionsRepository;
  readonly customerPrivacy: PostgresCustomerPrivacyRepository;
  readonly engagement: PostgresEngagementRepository;
  readonly openIcecatBulk: PostgresOpenIcecatBulkRepository;
  readonly openIcecatDetail: PostgresOpenIcecatDetailRepository;

  constructor(pool: SqlPool) {
    this.catalog = new PostgresCatalogRepository(pool);
    this.inventory = new PostgresInventoryRepository(pool);
    this.fairness = new PostgresFairnessRepository(pool);
    this.commerce = new PostgresCommerceRepository(pool);
    this.advice = new PostgresAdviceRepository(pool);
    this.finance = new PostgresFinanceRepository(pool);
    this.shipping = new PostgresShippingRepository(pool);
    this.identity = new PostgresIdentityRepository(pool);
    this.vendor = new PostgresVendorRepository(pool);
    this.mediaTrust = new PostgresMediaTrustRepository(pool);
    this.trust = new PostgresTrustRepository(pool);
    this.outbox = new PostgresOutboxRepository(pool);
    this.scheduledJobs = new PostgresScheduledJobStore(pool);
    this.searchProjection = new PostgresSearchProjectionRepository(pool);
    this.stockFreshness = new PostgresStockFreshnessRepository(pool);
    this.commercial = new PostgresCommercialRepository(pool);
    this.content = new PostgresContentRepository(pool);
    this.analytics = new PostgresAnalyticsRepository(pool);
    this.notificationOperations = new PostgresNotificationOperationsRepository(pool);
    this.security = new PostgresSecurityRepository(pool);
    this.reviews = new PostgresReviewRepository(pool);
    this.orderOperations = new PostgresOrderOperationsRepository(pool);
    this.availability = new PostgresAvailabilityRepository(pool);
    this.categoryGovernance = new PostgresCategoryGovernanceRepository(pool);
    this.promotions = new PostgresPromotionsRepository(pool);
    this.customerPrivacy = new PostgresCustomerPrivacyRepository(pool);
    this.engagement = new PostgresEngagementRepository(pool);
    this.openIcecatBulk = new PostgresOpenIcecatBulkRepository(pool);
    this.openIcecatDetail = new PostgresOpenIcecatDetailRepository(pool);
  }
}
