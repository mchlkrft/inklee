-- Lock down public table access after moving public pages/actions to server-only
-- reads and writes. RLS policies cannot hide individual columns, so exposing
-- profiles, booking_requests, studios, trips, trip_legs, and flash tables to
-- anon clients leaks data that the UI only intended to render selectively.

DROP POLICY IF EXISTS "public can submit booking requests" ON booking_requests;
DROP POLICY IF EXISTS "customers can view booking by token" ON booking_requests;
DROP POLICY IF EXISTS "customers can update booking by token" ON booking_requests;

DROP POLICY IF EXISTS "public can view artist profiles" ON profiles;

DROP POLICY IF EXISTS "public can read visible studios" ON studios;
DROP POLICY IF EXISTS "public can view trips" ON trips;
DROP POLICY IF EXISTS "public can view trip legs" ON trip_legs;

DROP POLICY IF EXISTS "public can view flash days" ON flash_days;
DROP POLICY IF EXISTS "public can read published flash items" ON flash_items;
