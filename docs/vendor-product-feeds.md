# KONTA MOU Vendor Product Feeds

Vendor Product Feeds let an active vendor connect an existing product catalogue to KONTA MOU without manually recreating every listing.

## Vendor workflow

The vendor dashboard route is `/vendor/catalog/feed`.

1. Choose **XML URL** or **Upload XML**.
2. KONTA MOU analyzes the XML and detects the repeating product element and common feed format.
3. Review the automatic field mapping.
4. Review **Ready**, **Warnings**, **Errors**, and **Excluded** counts plus a product preview.
5. Connect the feed.
6. URL feeds synchronize automatically every 1, 3, 6, or 24 hours and can also be synchronized immediately.
7. Uploaded feeds are reprocessed when the vendor uploads a replacement XML.

The importer is bounded to 25 MB and 50,000 normalized product rows per feed analysis. DTD and XML entity declarations are rejected.

## Catalogue governance

A feed never creates a parallel public catalogue.

```text
Vendor XML
  -> normalized feed identity
  -> exact vendor SKU / GTIN offer reuse
  -> exact GTIN canonical match
  -> unique Brand + MPN canonical match
  -> governed vendor submission when a safe canonical/category decision exists
  -> Vendor Offer / inventory
```

Ambiguous identity or category evidence stays in the existing review lifecycle. It is not guessed or published automatically.

Feed identity is persisted with source hashes and first/last-seen timestamps, so synchronization updates an existing feed item instead of creating a new product on every run.

## Missing products

An absent item is not removed after one feed run.

By default it must be absent from **two consecutive successful feed runs** before a linked offer is feed-paused and its available stock is reconciled down to active reservations. Failed XML fetches and failed analyses do not advance this counter.

If the product returns, KONTA MOU restores only an offer that was paused by that same feed. Platform moderation or unrelated archival state is not intentionally overridden.

## Price and stock

For an already linked vendor offer, the feed can update the vendor's EUR selling price and stock. Price changes continue through the existing vendor-offer price-history trigger. Stock changes create `inventory_movements` records with the feed and external-product identity.

## Images and descriptions

Description, main-image URL, additional-image URLs, product URL, size, color, category path, and availability are retained as feed source evidence and stay synchronized on every successful run.

Canonical product media remains governed by the existing media pipeline; source URLs are not treated as automatically trusted public media merely because they appeared in an XML document.

## Supported structures

Automatic recognition includes Google Merchant RSS/XML and common WooCommerce, Shopify, PrestaShop, Magento, Skroutz-like, BestPrice-like, KONTA MOU, and custom XML structures.

Nested `<variant>` / `<variation>` rows are expanded when they contain their own SKU or ID, so size/color variants can keep stable identities.

## Recommended KONTA MOU XML

The following is intentionally simple. Only `id` and `title` are structurally required for analysis; price, stock and image evidence determine whether a row is immediately commerce-ready.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <id>SKU-001</id>
    <title>Nike Air Max</title>
    <description>Product description</description>
    <ean>5201234567890</ean>
    <mpn>AM-001</mpn>
    <price>129.90</price>
    <currency>EUR</currency>
    <stock>8</stock>
    <availability>in_stock</availability>
    <brand>Nike</brand>
    <category>Shoes &gt; Sneakers</category>
    <image_link>https://merchant.example/images/sku-001.jpg</image_link>
    <additional_image_link>https://merchant.example/images/sku-001-2.jpg</additional_image_link>
    <link>https://merchant.example/products/sku-001</link>
  </product>
</products>
```

A product family with child variants may use:

```xml
<product>
  <id>TSHIRT-100</id>
  <title>Cotton T-Shirt</title>
  <price>29.90</price>
  <currency>EUR</currency>
  <stock>10</stock>
  <image_link>https://merchant.example/images/tshirt-100.jpg</image_link>
  <variants>
    <variant>
      <sku>TSHIRT-100-S-BLK</sku>
      <size>S</size>
      <color>Black</color>
    </variant>
    <variant>
      <sku>TSHIRT-100-M-BLK</sku>
      <size>M</size>
      <color>Black</color>
    </variant>
  </variants>
</product>
```

## URL security

Feed URLs must be public HTTP(S) URLs. Embedded credentials are removed. DNS targets and redirects are validated and private/local network targets are rejected before fetches.

## Admin

Admin operators use `/admin/catalogue/vendor-feeds` to see feed health, counts, sync timing and last errors; inspect mapping, issues and history; pause or resume a feed; edit persisted mapping; and force/reprocess URL feeds.

Raw uploaded XML files are not retained by this implementation. This reduces unnecessary storage of merchant catalogue files and means an uploaded feed must be re-uploaded after a mapping change.
