import type { AttributeDataType, CategoryAttributeSchema, CategoryCommerceMode, CategoryGovernancePolicy } from "../catalog/governance.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlPool, type SqlRow } from "./sql.ts";

export class PostgresCategoryGovernanceRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async category(input: { scope: DatabaseScope; marketId: string; categoryCodeOrSlug: string; locale?: string }): Promise<Readonly<{ policy: CategoryGovernancePolicy; schema: CategoryAttributeSchema }>> {
    return this.#uow.withTransaction({ ...input.scope, marketId: input.marketId, platformAccess: true }, async (tx) => {
      const category = requireSingleRow(await tx.query<SqlRow>(`SELECT c.id::text,c.code,c.slug,c.commerce_mode,c.require_compatibility_confirmation,c.regulated_checkout_allowed,c.counteroffer_allowed,c.advice_allowed,c.checkout_fulfilment_modes,
        COALESCE(ct.name,c.code) AS label
        FROM categories c LEFT JOIN category_translations ct ON ct.category_id=c.id AND ct.locale=$3
        JOIN markets m ON m.id=c.market_id WHERE m.code=$1 AND (c.code=$2 OR c.slug=$2) AND c.active=true`, [input.marketId,input.categoryCodeOrSlug,input.locale ?? "el"]), "Category governance record not found");
      const attrs = await tx.query<SqlRow>(`SELECT a.code,a.data_type,a.unit,a.variant_identity,a.filterable,a.values,ca.required,ca.sort_order,COALESCE(t.label,a.code) AS label
        FROM category_attributes ca JOIN attribute_definitions a ON a.id=ca.attribute_id
        LEFT JOIN attribute_translations t ON t.attribute_id=a.id AND t.locale=$2 WHERE ca.category_id=$1 ORDER BY ca.sort_order,a.code`, [category.id,input.locale ?? "el"]);
      const policy: CategoryGovernancePolicy = {
        categoryCode: String(category.slug || category.code), labelEl: String(category.label), commerceMode: String(category.commerce_mode) as CategoryCommerceMode,
        requireCompatibilityConfirmation: Boolean(category.require_compatibility_confirmation), regulatedCheckoutAllowed: Boolean(category.regulated_checkout_allowed),
        counterofferAllowed: Boolean(category.counteroffer_allowed), adviceAllowed: Boolean(category.advice_allowed),
        checkoutFulfilmentModes: Array.isArray(category.checkout_fulfilment_modes) ? category.checkout_fulfilment_modes.map(String) as any : undefined,
        attributes: attrs.rows.map((row) => ({ attributeCode:String(row.code), required:Boolean(row.required), sortOrder:Number(row.sort_order) }))
      };
      const schema: CategoryAttributeSchema = { categoryCode: policy.categoryCode, commerceMode: policy.commerceMode, attributes: attrs.rows.map((row) => ({
        code:String(row.code),labelEl:String(row.label),dataType:String(row.data_type) as AttributeDataType,unit:row.unit?String(row.unit):undefined,
        values:Array.isArray(row.values)?row.values.map(String):[],variantIdentity:Boolean(row.variant_identity),filterable:Boolean(row.filterable),required:Boolean(row.required),sortOrder:Number(row.sort_order)
      })) };
      return { policy, schema };
    }, { readOnly: true });
  }

  async savePolicy(input: { scope: DatabaseScope; marketId: string; categoryCodeOrSlug: string; policy: CategoryGovernancePolicy; locale?: string }): Promise<Readonly<{ policy: CategoryGovernancePolicy; schema: CategoryAttributeSchema }>> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.marketId, platformAccess: true }, async (tx) => {
      const category = requireSingleRow(await tx.query<SqlRow>(`SELECT c.id::text FROM categories c JOIN markets m ON m.id=c.market_id WHERE m.code=$1 AND (c.code=$2 OR c.slug=$2) AND c.active=true FOR UPDATE`, [input.marketId,input.categoryCodeOrSlug]), "Category governance record not found");
      await tx.query(`UPDATE categories SET commerce_mode=$2,require_compatibility_confirmation=$3,regulated_checkout_allowed=$4,counteroffer_allowed=$5,advice_allowed=$6,checkout_fulfilment_modes=$7,updated_at=now() WHERE id=$1`, [
        category.id,input.policy.commerceMode,Boolean(input.policy.requireCompatibilityConfirmation),Boolean(input.policy.regulatedCheckoutAllowed),input.policy.counterofferAllowed !== false,input.policy.adviceAllowed !== false,input.policy.checkoutFulfilmentModes ? [...input.policy.checkoutFulfilmentModes] : []
      ]);
      if (input.policy.attributes !== undefined) {
        const codes = input.policy.attributes.map((binding) => binding.attributeCode);
        if (new Set(codes).size !== codes.length) throw new Error("Duplicate category attribute binding");
        if (codes.length) {
          const known = await tx.query<SqlRow>(`SELECT code FROM attribute_definitions WHERE code = ANY($1::text[])`, [codes]);
          if (known.rowCount !== codes.length) throw new Error("Unknown governed attribute binding");
        }
        await tx.query(`DELETE FROM category_attributes WHERE category_id=$1`, [category.id]);
        for (const binding of input.policy.attributes) await tx.query(`INSERT INTO category_attributes(category_id,attribute_id,required,sort_order) SELECT $1,id,$3,$4 FROM attribute_definitions WHERE code=$2`, [category.id,binding.attributeCode,Boolean(binding.required),binding.sortOrder ?? 0]);
      }
    });
    return this.category({ scope: input.scope, marketId: input.marketId, categoryCodeOrSlug: input.categoryCodeOrSlug, locale: input.locale });
  }
}
