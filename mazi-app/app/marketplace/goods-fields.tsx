import type {MaziListing} from "../../lib/mazi-community";
import {goodsCategories,goodsConditions,goodsUnits,goodsFulfillment,goodsPriceTypes,goodsVatBasis} from "../../lib/mazi-community";
import s from "../community.module.css";

export function GoodsFields({item}:{item?:MaziListing}){
 return <>
  <div className={s.goodsFormGrid}>
   <label>Καταχώριση
    {item?<><input type="hidden" name="kind" value={item.kind}/><strong>{item.kind==="offer"?"Προσφέρω φυσικά είδη":"Αναζητώ φυσικά είδη"}</strong></>:
     <select name="kind" required defaultValue="offer"><option value="offer">Προσφέρω</option><option value="request">Αναζητώ</option></select>}
   </label>
   <label>Κατηγορία ειδών<select name="item_category" required defaultValue={item?.item_category||"equipment"}>
    {Object.entries(goodsCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
  </div>
  <label>Τίτλος<input name="title" required minLength={8} maxLength={140}
   defaultValue={item?.title} placeholder="π.χ. Επαγγελματικό ψυγείο 400 L"/></label>
  <label>Περιγραφή και τεχνικές λεπτομέρειες<textarea name="description" required
   minLength={30} maxLength={2500} rows={5} defaultValue={item?.description}
   placeholder="Μάρκα, μοντέλο, προδιαγραφές, κατάσταση, ηλικία, διαθεσιμότητα και τυχόν περιορισμοί."/></label>
  <div className={s.goodsFormGrid}>
   <label>Κατάσταση<select name="item_condition" required defaultValue={item?.item_condition||"new"}>
    {Object.entries(goodsConditions).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <label>Ποσότητα<input name="quantity" type="number" min="0.01" max="1000000" step="0.01"
    defaultValue={item?.quantity||1} required/></label>
   <label>Μονάδα<select name="quantity_unit" required defaultValue={item?.quantity_unit||"piece"}>
    {Object.entries(goodsUnits).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <label>Πόλη / περιοχή<input name="location_city" required minLength={2} maxLength={100}
    defaultValue={item?.location_city||""} placeholder="π.χ. Σπάρτη"/></label>
   <label>Παράδοση<select name="fulfillment" required defaultValue={item?.fulfillment||"either"}>
    {Object.entries(goodsFulfillment).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <label>Τύπος τιμής<select name="price_type" required defaultValue={item?.price_type||"on_request"}>
    {Object.entries(goodsPriceTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <label>Προτεινόμενη τιμή (€), εφόσον υπάρχει<input name="price_eur" type="text" inputMode="decimal"
    pattern="[0-9]{1,9}([.,][0-9]{1,2})?" maxLength={12}
    defaultValue={item?.price_cents==null?"":(item.price_cents/100).toFixed(2)}
    placeholder="π.χ. 120,00"/></label>
   <label>Τρόπος αναγραφής ΦΠΑ<select name="price_vat_basis" required defaultValue={item?.price_vat_basis||"unspecified"}>
    {Object.entries(goodsVatBasis).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
  </div>
  <label className={s.goodsConsent}><input type="checkbox" name="goods_policy_accepted" required/>
   <span>Δηλώνω ότι πρόκειται αποκλειστικά για νόμιμα φυσικά αγαθά που δικαιούμαι να διαθέσω
    ή να ζητήσω, ότι τα στοιχεία είναι αληθή, και ότι δεν αναρτώ απαγορευμένα,
    επικίνδυνα ή μη αδειοδοτημένα είδη. Η τελική τιμή, ο ΦΠΑ, η αποστολή και
    τα παραστατικά συμφωνούνται απευθείας μεταξύ των επιχειρήσεων.</span>
  </label>
 </>;
}
