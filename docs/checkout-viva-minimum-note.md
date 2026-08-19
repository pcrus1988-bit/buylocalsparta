# Viva checkout minimum handling

Viva Smart Checkout requires payment-order amounts of at least 30 minor units. The checkout API now blocks orders below that provider minimum before attempting to create a Viva payment order, so deterministic local validation failures do not enter provider reconciliation/manual-review state.

The pickup fulfilment recalculation fix is recorded in migration `0075_checkout_pickup_delivery_rule_fix.sql`.
