import { redirect } from "next/navigation";
// Legacy concept URL. The canonical product is now on the hospitality gateway.
export default function ExchangeLegacyRedirect() {
  redirect("https://hospitality.kontamou.site/drinkStock");
}
