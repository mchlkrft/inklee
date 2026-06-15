-- Add FK from booking_requests.slot_id to slots.id
ALTER TABLE booking_requests
  ADD CONSTRAINT booking_requests_slot_id_fk
  FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE SET NULL;
