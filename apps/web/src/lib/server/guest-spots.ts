import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { sanitizeBioLinkUrl } from "@inklee/shared/bio-page";
import { randomTravelIconKey } from "@inklee/shared/travel-icons";
import {
  GUEST_SPOT_OPEN_STATUSES,
  GS_NOTE_MAX,
  canTransitionGuestSpotRequest,
  validateGuestSpotRequestInput,
  type GuestSpotRequestInput,
  type GuestSpotRequestStatus,
} from "@inklee/shared/guest-spots";
import { checkGuestSpotRequestRateLimit } from "@/lib/ratelimit";

// Guest spot request server core (Inklee 2.0 Phase 4). All writes run
// service-role after explicit party checks with conditional status-gated
// updates (the bookings.ts pattern hardened); the request tables grant both
// parties SELECT only. Accept/Pass/Suggest dates are the studio verbs
// (founder verb rule); acceptance materializes a trip + trip leg in the
// artist's live travel data (approved default 4) so the artist calendar and
// booking form work through existing pipelines.

const REQUEST_COLS =
  "id, artist_user_id, studio_profile_id, requested_start_date, requested_end_date, date_flexibility, social_link, introduction, expected_clients, equipment_needs, status, created_at";

type RequestRow = {
  id: string;
  artist_user_id: string;
  studio_profile_id: string;
  requested_start_date: string;
  requested_end_date: string;
  date_flexibility: string;
  social_link: string;
  introduction: string;
  expected_clients: string | null;
  equipment_needs: string | null;
  status: string;
  created_at: string;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ownedStudio(
  ownerId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await serviceClient
    .from("studio_profiles")
    .select("id, name")
    .eq("owner_user_id", ownerId)
    .maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}

/**
 * Conditional status hop; returns false when the row was not in a state the
 * FSM allows to reach `to`. From-states the FSM rejects are dropped, not
 * fatal, so one illegal candidate cannot veto the legal ones.
 */
async function transitionRequest(
  requestId: string,
  from: GuestSpotRequestStatus[],
  to: GuestSpotRequestStatus,
): Promise<boolean> {
  const valid = from.filter((f) => canTransitionGuestSpotRequest(f, to).ok);
  if (valid.length === 0) return false;
  const { data } = await serviceClient
    .from("guest_spot_requests")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .in("status", valid)
    .select("id");
  return Boolean(data?.length);
}

// ---------------------------------------------------------------------------
// Artist side.

export async function submitGuestSpotRequestCore(
  artistId: string,
  studioProfileId: string,
  input: GuestSpotRequestInput,
): Promise<{ error?: string; requestId?: string }> {
  const invalid = validateGuestSpotRequestInput(input, todayKey());
  if (invalid) return { error: invalid };
  const sanitized = sanitizeBioLinkUrl(input.socialLink);
  const social =
    sanitized && /^https?:\/\//i.test(sanitized) ? sanitized : null;
  if (!social) return { error: "Add your Instagram or another social link." };

  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("id, owner_user_id, publication_status, guest_spot_status")
    .eq("id", studioProfileId)
    .maybeSingle();
  if (!studio || studio.publication_status !== "published")
    return { error: "This studio is not taking requests right now." };
  // invitation_only exists to stop unsolicited requests too; only an
  // explicitly accepting studio is requestable.
  if (studio.guest_spot_status !== "accepting")
    return { error: "This studio is not taking guest spot requests." };
  if (studio.owner_user_id === artistId)
    return { error: "This is your own studio." };

  const { allowed } = await checkGuestSpotRequestRateLimit(artistId);
  if (!allowed)
    return { error: "Too many requests today. Try again tomorrow." };

  const { data: created, error: insertErr } = await serviceClient
    .from("guest_spot_requests")
    .insert({
      artist_user_id: artistId,
      studio_profile_id: studioProfileId,
      requested_start_date: input.startDate,
      requested_end_date: input.endDate,
      date_flexibility: input.dateFlexibility,
      social_link: social,
      introduction: input.introduction.trim(),
      expected_clients: input.expectedClients?.trim() || null,
      equipment_needs: input.equipmentNeeds?.trim() || null,
    })
    .select("id")
    .single();
  if (insertErr) {
    if (insertErr.code === "23505")
      return { error: "You already have an open request with this studio." };
    return { error: "Could not send your request. Try again." };
  }
  return { requestId: created.id as string };
}

export async function withdrawRequestCore(
  artistId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select("id, artist_user_id, status")
    .eq("id", requestId)
    .eq("artist_user_id", artistId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  const moved = await transitionRequest(
    requestId,
    [
      "submitted",
      "under_review",
      "information_requested",
      "alternative_dates_proposed",
      "artist_reviewing_proposal",
    ],
    "withdrawn",
  );
  if (!moved) return { error: "This request cannot be withdrawn anymore." };
  return {};
}

/**
 * Artist takes the studio's suggested dates: confirm with those dates.
 * Retryable: a request stranded in accepted (materialization failed midway)
 * re-enters through the already-accepted proposal.
 */
export async function acceptProposalCore(
  artistId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select(REQUEST_COLS)
    .eq("id", requestId)
    .eq("artist_user_id", artistId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };

  const { data: proposal } = await serviceClient
    .from("guest_spot_proposals")
    .select("id, status, start_date, end_date")
    .eq("guest_spot_request_id", requestId)
    .in("status", ["proposed", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!proposal) return { error: "There is no open date suggestion." };

  if (request.status !== "accepted") {
    const moved = await transitionRequest(
      requestId,
      ["alternative_dates_proposed", "artist_reviewing_proposal"],
      "accepted",
    );
    if (!moved) return { error: "This request already moved on." };
  }

  await serviceClient
    .from("guest_spot_proposals")
    .update({ status: "accepted" })
    .eq("id", proposal.id);

  return finishAcceptance(
    request as RequestRow,
    proposal.start_date as string,
    proposal.end_date as string,
  );
}

// ---------------------------------------------------------------------------
// Studio side. Verbs: Accept / Pass / Suggest dates.

export async function acceptRequestCore(
  ownerId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return { error: "Not your studio." };
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select(REQUEST_COLS)
    .eq("id", requestId)
    .eq("studio_profile_id", studio.id)
    .maybeSingle();
  if (!request) return { error: "Request not found." };

  // Retry path: a stuck 'accepted' request re-enters materialization. When
  // the acceptance came from a date proposal, honour the agreed dates, not
  // the originally requested ones (finishAcceptance also prefers an already
  // written stay's dates, so a half-materialized stay stays consistent).
  let startsOn = (request as RequestRow).requested_start_date;
  let endsOn = (request as RequestRow).requested_end_date;
  if (request.status !== "accepted") {
    const moved = await transitionRequest(
      requestId,
      ["submitted", "under_review"],
      "accepted",
    );
    if (!moved) return { error: "This request already moved on." };
  } else {
    const { data: acceptedProposal } = await serviceClient
      .from("guest_spot_proposals")
      .select("start_date, end_date")
      .eq("guest_spot_request_id", requestId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (acceptedProposal) {
      startsOn = acceptedProposal.start_date as string;
      endsOn = acceptedProposal.end_date as string;
    }
  }
  return finishAcceptance(request as RequestRow, startsOn, endsOn);
}

export async function passRequestCore(
  ownerId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return { error: "Not your studio." };
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select("id")
    .eq("id", requestId)
    .eq("studio_profile_id", studio.id)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  const moved = await transitionRequest(
    requestId,
    [
      "submitted",
      "under_review",
      "information_requested",
      "alternative_dates_proposed",
      "artist_reviewing_proposal",
    ],
    "declined",
  );
  if (!moved) return { error: "This request already moved on." };
  return {};
}

export async function proposeDatesCore(
  ownerId: string,
  requestId: string,
  startDate: string,
  endDate: string,
  message: string | null,
): Promise<{ error?: string }> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return { error: "Not your studio." };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  )
    return { error: "Pick the dates you want to suggest." };
  if (endDate < startDate)
    return { error: "The end date cannot be before the start date." };
  if (startDate < todayKey())
    return { error: "Suggested dates need to be in the future." };
  if ((message ?? "").length > GS_NOTE_MAX)
    return { error: "Keep the message shorter." };

  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select("id, artist_user_id, status")
    .eq("id", requestId)
    .eq("studio_profile_id", studio.id)
    .maybeSingle();
  if (!request) return { error: "Request not found." };

  // Includes the self-loop: a studio can revise its own open suggestion.
  const moved = await transitionRequest(
    requestId,
    [
      "submitted",
      "under_review",
      "alternative_dates_proposed",
      "artist_reviewing_proposal",
    ],
    "alternative_dates_proposed",
  );
  if (!moved) return { error: "This request already moved on." };

  // Supersede any older open proposal, then record the new one.
  await serviceClient
    .from("guest_spot_proposals")
    .update({ status: "superseded" })
    .eq("guest_spot_request_id", requestId)
    .eq("status", "proposed");
  const { error: insertErr } = await serviceClient
    .from("guest_spot_proposals")
    .insert({
      guest_spot_request_id: requestId,
      artist_user_id: request.artist_user_id,
      studio_profile_id: studio.id,
      proposed_by_user_id: ownerId,
      start_date: startDate,
      end_date: endDate,
      message: message?.trim() || null,
    });
  if (insertErr) return { error: "Could not send the suggestion. Try again." };
  return {};
}

export async function addPrivateNoteCore(
  ownerId: string,
  requestId: string,
  body: string,
): Promise<{ error?: string }> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return { error: "Not your studio." };
  if (!body.trim()) return { error: "Write the note first." };
  if (body.length > GS_NOTE_MAX) return { error: "Keep the note shorter." };
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select("id, artist_user_id")
    .eq("id", requestId)
    .eq("studio_profile_id", studio.id)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  const { error } = await serviceClient
    .from("guest_spot_private_notes")
    .insert({
      guest_spot_request_id: requestId,
      artist_user_id: request.artist_user_id,
      studio_profile_id: studio.id,
      author_user_id: ownerId,
      body: body.trim(),
    });
  if (error) return { error: "Could not send the note. Try again." };
  return {};
}

// ---------------------------------------------------------------------------
// Acceptance materialization (approved default 4). Idempotent and retryable:
// the stay's UNIQUE(request_id) absorbs re-runs, and a half-materialized
// stay (trip_leg_id null) is finished on the next accept attempt.

async function finishAcceptance(
  request: RequestRow,
  startsOn: string,
  endsOn: string,
): Promise<{ error?: string }> {
  // 1. The stay (insert-or-fetch; UNIQUE on request id).
  const { data: insertedStay, error: stayErr } = await serviceClient
    .from("guest_spot_stays")
    .upsert(
      {
        guest_spot_request_id: request.id,
        artist_user_id: request.artist_user_id,
        studio_profile_id: request.studio_profile_id,
        starts_on: startsOn,
        ends_on: endsOn,
      },
      { onConflict: "guest_spot_request_id", ignoreDuplicates: true },
    )
    .select("id, trip_leg_id, starts_on, ends_on")
    .maybeSingle();
  let stay = insertedStay;
  if (!stay) {
    const { data: existingStay } = await serviceClient
      .from("guest_spot_stays")
      .select("id, trip_leg_id, starts_on, ends_on")
      .eq("guest_spot_request_id", request.id)
      .maybeSingle();
    stay = existingStay ?? null;
  }
  if (stayErr && !stay)
    return { error: "Could not record the stay. Try accepting again." };
  if (!stay)
    return { error: "Could not record the stay. Try accepting again." };

  // A pre-existing stay is the source of truth for the agreed dates: a retry
  // must never re-date a half-materialized acceptance.
  const legStartsOn = (stay.starts_on as string) ?? startsOn;
  const legEndsOn = (stay.ends_on as string) ?? endsOn;

  // 2. Materialize the trip + leg once.
  if (!stay.trip_leg_id) {
    const { data: studio } = await serviceClient
      .from("studio_profiles")
      .select("name, city")
      .eq("id", request.studio_profile_id)
      .maybeSingle();
    const title = studio
      ? [studio.name, studio.city].filter(Boolean).join(", ")
      : "Guest spot";

    const { data: trip, error: tripErr } = await serviceClient
      .from("trips")
      .insert({
        artist_id: request.artist_user_id,
        title: title.slice(0, 120),
        icon: randomTravelIconKey(),
      })
      .select("id")
      .single();
    if (tripErr || !trip)
      return { error: "Could not add the trip. Try accepting again." };

    const { data: leg, error: legErr } = await serviceClient
      .from("trip_legs")
      .insert({
        trip_id: trip.id,
        starts_on: legStartsOn,
        ends_on: legEndsOn,
        origin: "guest_spot",
        guest_spot_stay_id: stay.id,
      })
      .select("id")
      .single();
    if (legErr || !leg) {
      await serviceClient.from("trips").delete().eq("id", trip.id);
      // 23505 on trip_legs_one_per_stay_idx: a concurrent acceptance already
      // materialized this stay. Not an error; fall through to confirm.
      if (legErr?.code !== "23505")
        return { error: "Could not add the trip. Try accepting again." };
    } else {
      // Link conditionally: if a concurrent run linked first, ours loses and
      // its trip is removed so no orphan lands on the artist's calendar.
      const { data: linked, error: linkErr } = await serviceClient
        .from("guest_spot_stays")
        .update({ trip_leg_id: leg.id, updated_at: new Date().toISOString() })
        .eq("id", stay.id)
        .is("trip_leg_id", null)
        .select("id");
      if (linkErr) {
        await serviceClient.from("trips").delete().eq("id", trip.id);
        return { error: "Could not add the trip. Try accepting again." };
      }
      if (!linked?.length) {
        await serviceClient.from("trips").delete().eq("id", trip.id);
      }
    }
  }

  // 3. Confirm the request.
  const confirmed = await transitionRequest(
    request.id,
    ["accepted", "awaiting_confirmation"],
    "confirmed",
  );
  if (!confirmed && request.status !== "confirmed")
    return { error: "Could not finish the confirmation. Try accepting again." };
  return {};
}

/**
 * Cancel a confirmed stay (either party). Removes the materialized trip so
 * the artist calendar never shows a cancelled guest spot; the request moves
 * to cancelled.
 */
export async function cancelStayCore(
  userId: string,
  stayId: string,
): Promise<{ error?: string }> {
  const { data: stay } = await serviceClient
    .from("guest_spot_stays")
    .select(
      "id, artist_user_id, studio_profile_id, guest_spot_request_id, trip_leg_id, status",
    )
    .eq("id", stayId)
    .maybeSingle();
  if (!stay) return { error: "Stay not found." };
  const studio = await ownedStudio(userId);
  const isArtist = stay.artist_user_id === userId;
  const isOwner = studio?.id === stay.studio_profile_id;
  if (!isArtist && !isOwner) return { error: "Not your stay." };

  const { data: moved } = await serviceClient
    .from("guest_spot_stays")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", stayId)
    .in("status", ["confirmed", "active"])
    .select("id");
  if (!moved?.length)
    return { error: "This stay cannot be cancelled anymore." };

  // Remove the materialized leg; the trip goes too only when nothing else
  // hangs off it (the artist may have added their own stops to the trip).
  if (stay.trip_leg_id) {
    const { data: leg } = await serviceClient
      .from("trip_legs")
      .select("trip_id")
      .eq("id", stay.trip_leg_id as string)
      .maybeSingle();
    if (leg?.trip_id) {
      await serviceClient
        .from("trip_legs")
        .delete()
        .eq("id", stay.trip_leg_id as string);
      const { count } = await serviceClient
        .from("trip_legs")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", leg.trip_id as string);
      if (!count) {
        await serviceClient.from("trips").delete().eq("id", leg.trip_id);
      }
    }
  }
  if (stay.guest_spot_request_id) {
    await transitionRequest(
      stay.guest_spot_request_id as string,
      ["confirmed"],
      "cancelled",
    );
  }
  return {};
}

// ---------------------------------------------------------------------------
// Listers (shaped for the surfaces; service-role reads after party checks).

export type ArtistRequestListItem = {
  id: string;
  studioName: string;
  studioCity: string | null;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
};

export async function listArtistRequests(
  artistId: string,
): Promise<ArtistRequestListItem[]> {
  const { data: requests } = await serviceClient
    .from("guest_spot_requests")
    .select(
      "id, studio_profile_id, requested_start_date, requested_end_date, status, created_at",
    )
    .eq("artist_user_id", artistId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!requests?.length) return [];
  const studioIds = [
    ...new Set(requests.map((r) => r.studio_profile_id as string)),
  ];
  const { data: studios } = await serviceClient
    .from("studio_profiles")
    .select("id, name, city")
    .in("id", studioIds);
  const byId = new Map(
    (studios ?? []).map((s) => [
      s.id as string,
      { name: s.name as string, city: (s.city as string | null) ?? null },
    ]),
  );
  // Confirmed rows show the agreed stay dates (which differ from the request
  // when the artist took a date suggestion).
  const { data: stays } = await serviceClient
    .from("guest_spot_stays")
    .select("guest_spot_request_id, starts_on, ends_on")
    .in(
      "guest_spot_request_id",
      requests.map((r) => r.id as string),
    );
  const stayDates = new Map(
    (stays ?? []).map((s) => [
      s.guest_spot_request_id as string,
      { start: s.starts_on as string, end: s.ends_on as string },
    ]),
  );
  return requests.map((r) => {
    const s = byId.get(r.studio_profile_id as string);
    const stay = stayDates.get(r.id as string);
    return {
      id: r.id as string,
      studioName: s?.name ?? "Removed studio",
      studioCity: s?.city ?? null,
      startDate: stay?.start ?? (r.requested_start_date as string),
      endDate: stay?.end ?? (r.requested_end_date as string),
      status: r.status as string,
      createdAt: r.created_at as string,
    };
  });
}

export type RequestDetail = {
  id: string;
  studioProfileId: string;
  studioName: string;
  artistUserId: string;
  artistName: string;
  artistSlug: string | null;
  startDate: string;
  endDate: string;
  dateFlexibility: string;
  socialLink: string;
  introduction: string;
  expectedClients: string | null;
  equipmentNeeds: string | null;
  status: string;
  createdAt: string;
  proposal: {
    startDate: string;
    endDate: string;
    message: string | null;
  } | null;
  // Present once accepted/confirmed; carries the agreed dates.
  stay: {
    id: string;
    startsOn: string;
    endsOn: string;
    status: string;
  } | null;
  notes: Array<{
    id: string;
    body: string;
    fromStudio: boolean;
    createdAt: string;
  }>;
};

async function shapeRequestDetail(row: RequestRow): Promise<RequestDetail> {
  const [
    { data: studio },
    { data: artist },
    { data: proposal },
    { data: stay },
    { data: notes },
  ] = await Promise.all([
    serviceClient
      .from("studio_profiles")
      .select("name, owner_user_id")
      .eq("id", row.studio_profile_id)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("display_name, slug")
      .eq("id", row.artist_user_id)
      .maybeSingle(),
    serviceClient
      .from("guest_spot_proposals")
      .select("start_date, end_date, message")
      .eq("guest_spot_request_id", row.id)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from("guest_spot_stays")
      .select("id, starts_on, ends_on, status")
      .eq("guest_spot_request_id", row.id)
      .maybeSingle(),
    serviceClient
      .from("guest_spot_private_notes")
      .select("id, body, author_user_id, created_at")
      .eq("guest_spot_request_id", row.id)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);
  const ownerId = (studio?.owner_user_id as string | null) ?? null;
  return {
    id: row.id,
    studioProfileId: row.studio_profile_id,
    studioName: (studio?.name as string) ?? "Removed studio",
    artistUserId: row.artist_user_id,
    artistName:
      ((artist?.display_name as string | null) ||
        (artist?.slug as string | null)) ??
      "Artist",
    artistSlug: (artist?.slug as string | null) ?? null,
    startDate: row.requested_start_date,
    endDate: row.requested_end_date,
    dateFlexibility: row.date_flexibility,
    socialLink: row.social_link,
    introduction: row.introduction,
    expectedClients: row.expected_clients,
    equipmentNeeds: row.equipment_needs,
    status: row.status,
    createdAt: row.created_at,
    proposal: proposal
      ? {
          startDate: proposal.start_date as string,
          endDate: proposal.end_date as string,
          message: (proposal.message as string | null) ?? null,
        }
      : null,
    stay: stay
      ? {
          id: stay.id as string,
          startsOn: stay.starts_on as string,
          endsOn: stay.ends_on as string,
          status: stay.status as string,
        }
      : null,
    notes: (notes ?? []).map((n) => ({
      id: n.id as string,
      body: n.body as string,
      fromStudio: n.author_user_id === ownerId,
      createdAt: n.created_at as string,
    })),
  };
}

export async function getArtistRequestDetail(
  artistId: string,
  requestId: string,
): Promise<RequestDetail | null> {
  const { data } = await serviceClient
    .from("guest_spot_requests")
    .select(REQUEST_COLS)
    .eq("id", requestId)
    .eq("artist_user_id", artistId)
    .maybeSingle();
  if (!data) return null;
  return shapeRequestDetail(data as RequestRow);
}

export async function getStudioRequestDetail(
  ownerId: string,
  requestId: string,
): Promise<RequestDetail | null> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return null;
  const { data } = await serviceClient
    .from("guest_spot_requests")
    .select(REQUEST_COLS)
    .eq("id", requestId)
    .eq("studio_profile_id", studio.id)
    .maybeSingle();
  if (!data) return null;
  return shapeRequestDetail(data as RequestRow);
}

export type StudioInbox = {
  open: Array<{
    id: string;
    artistName: string;
    startDate: string;
    endDate: string;
    status: string;
    createdAt: string;
  }>;
  // Quiet hold (founder decision 2026-07-17): requests from blacklisted
  // artists land here collapsed, with no notification anywhere. The owner
  // can still open and pass them.
  blocked: StudioInbox["open"];
};

export async function listStudioInbox(
  ownerId: string,
): Promise<StudioInbox | null> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return null;
  const [{ data: requests }, { data: blacklist }] = await Promise.all([
    serviceClient
      .from("guest_spot_requests")
      .select(
        "id, artist_user_id, requested_start_date, requested_end_date, status, created_at",
      )
      .eq("studio_profile_id", studio.id)
      .in("status", GUEST_SPOT_OPEN_STATUSES)
      .order("created_at", { ascending: true })
      .limit(100),
    serviceClient
      .from("studio_blacklists")
      .select("artist_user_id")
      .eq("studio_profile_id", studio.id),
  ]);
  const blocked = new Set(
    (blacklist ?? []).map((b) => b.artist_user_id as string),
  );
  const artistIds = [
    ...new Set((requests ?? []).map((r) => r.artist_user_id as string)),
  ];
  const { data: artists } = artistIds.length
    ? await serviceClient
        .from("profiles")
        .select("id, display_name, slug")
        .in("id", artistIds)
    : { data: [] };
  const names = new Map(
    (artists ?? []).map((a) => [
      a.id as string,
      ((a.display_name as string | null) || (a.slug as string | null)) ??
        "Artist",
    ]),
  );
  const shape = (r: NonNullable<typeof requests>[number]) => ({
    id: r.id as string,
    artistName: names.get(r.artist_user_id as string) ?? "Artist",
    startDate: r.requested_start_date as string,
    endDate: r.requested_end_date as string,
    status: r.status as string,
    createdAt: r.created_at as string,
  });
  return {
    open: (requests ?? [])
      .filter((r) => !blocked.has(r.artist_user_id as string))
      .map(shape),
    blocked: (requests ?? [])
      .filter((r) => blocked.has(r.artist_user_id as string))
      .map(shape),
  };
}

export type StudioStay = {
  id: string;
  artistName: string;
  artistSlug: string | null;
  startsOn: string;
  endsOn: string;
  status: string;
};

/** The v1 studio calendar: requested dates live in the inbox, stays here. */
export async function listStudioStays(
  ownerId: string,
): Promise<StudioStay[] | null> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return null;
  const { data: stays } = await serviceClient
    .from("guest_spot_stays")
    .select("id, artist_user_id, starts_on, ends_on, status")
    .eq("studio_profile_id", studio.id)
    .order("starts_on", { ascending: true })
    .limit(100);
  if (!stays?.length) return [];
  const artistIds = [...new Set(stays.map((s) => s.artist_user_id as string))];
  const { data: artists } = await serviceClient
    .from("profiles")
    .select("id, display_name, slug")
    .in("id", artistIds);
  const byId = new Map(
    (artists ?? []).map((a) => [
      a.id as string,
      {
        name:
          ((a.display_name as string | null) || (a.slug as string | null)) ??
          "Artist",
        slug: (a.slug as string | null) ?? null,
      },
    ]),
  );
  return stays.map((s) => {
    const a = byId.get(s.artist_user_id as string);
    return {
      id: s.id as string,
      artistName: a?.name ?? "Artist",
      artistSlug: a?.slug ?? null,
      startsOn: s.starts_on as string,
      endsOn: s.ends_on as string,
      status: s.status as string,
    };
  });
}
