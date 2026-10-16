/** Public canonical IDs are heterogeneous in the live KONTA MOY registry.
 * Existing variants use UUIDs; newer rows can use cv_ scoped IDs.
 * This is a display/routing validator, never proof of product eligibility.
 */
export function validCanonicalPublicId(value:unknown):value is string{
 if(typeof value!=="string"||value.length>128)return false;
 return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
   || /^cv_[a-z0-9_-]{8,120}$/.test(value);
}
