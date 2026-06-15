// Shapes for GET /api/mobile/clients (list) and /api/mobile/clients/:email
// (detail). A "client" is an aggregation over booking_requests grouped by
// customer_email — there is no clients table. Notes are read-only on mobile
// (no write endpoint yet).
//
// The canonical shapes now live in @inklee/shared (shared with the server route
// handlers); re-exported here under their original names so existing import
// sites are unchanged.
export type {
  MobileClientListItem as ClientListItem,
  MobileClientHistoryItem as ClientHistoryItem,
  MobileClientDetail as ClientDetail,
} from "@inklee/shared/mobile-api";
