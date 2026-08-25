-- Allow delivery drivers to be represented accurately in the customer order timeline.
-- Driver actions were already emitted with actor_type='driver', but the original
-- order_timeline_events check constraint predated the delivery-driver subsystem.

ALTER TABLE order_timeline_events
  DROP CONSTRAINT IF EXISTS order_timeline_events_actor_type_check;

ALTER TABLE order_timeline_events
  ADD CONSTRAINT order_timeline_events_actor_type_check
  CHECK (
    actor_type IN (
      'customer',
      'vendor',
      'admin',
      'system',
      'payment_provider',
      'provider',
      'driver'
    )
  );
