// Shapes for GET /api/mobile/clients (list) and /api/mobile/clients/:email
// (detail). A "client" is an aggregation over booking_requests grouped by
// customer_email — there is no clients table. Notes are read-only on mobile
// (no write endpoint yet).

export type ClientListItem = {
  email: string;
  handle: string; // "" when the newest booking had no handle
  bookingCount: number;
  lastBookingAt: string; // ISO
  latestStatus: string;
};

export type ClientHistoryItem = {
  id: string; // booking_requests.id — opens the shared /bookings/[id] screen
  status: string;
  placement: string | null;
  size: string | null; // already a friendly measurement label (formatSize)
  preferredDate: string | null; // date-key or ISO
  createdAt: string; // ISO
  depositAmount: number | null;
};

export type ClientDetail = {
  email: string;
  client: string; // display label (@handle / email / "Client")
  notes: string | null;
  bookingCount: number;
  history: ClientHistoryItem[];
};
