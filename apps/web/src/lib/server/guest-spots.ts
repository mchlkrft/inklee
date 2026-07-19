import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { sanitizeBioLinkUrl } from "@inklee/shared/bio-page";
import { randomTravelIconKey } from "@inklee/shared/travel-icons";
import {
  GUEST_SPOT_LEG_LOCKED_MESSAGE,
  GUEST_SPOT_OPEN_STATUSES,
  GS_NOTE_MAX,
  canTransitionGuestSpotRequest,
  validateGuestSpotRequestInput,
  type GuestSpotRequestInput,
  type GuestSpotRequestStatus,
} from "@inklee/shared/guest-spots";
import { sortHouseRules } from "@inklee/shared/studio-profile";
import { checkGuestSpotRequestRateLimit } from "@/lib/ratelimit";
import { notifyGuestSpotEvent } from "@/lib/server/guest-spot-notifications";

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

  // Pre-check the one-open-request constraint BEFORE the rate limiter so a
  // duplicate submission never burns one of the 5 daily slots on a 23505.
  const { data: openExisting } = await serviceClient
    .from("guest_spot_requests")
    .select("id")
    .eq("artist_user_id", artistId)
    .eq("studio_profile_id", studioProfileId)
    .in("status", GUEST_SPOT_OPEN_STATUSES)
    .limit(1)
    .maybeSingle();
  if (openExisting)
    return { error: "You already have an open request with this studio." };

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
  // Q9 wiring: feed + push + email to the owner (quiet-held requests send
  // nothing; the notifier checks the blacklist itself). Never fails the
  // submission.
  await notifyGuestSpotEvent({
    kind: "request_submitted",
    requestId: created.id as string,
    artistId,
    studioProfileId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
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

  const wasFreshTransition = request.status !== "accepted";
  const result = await finishAcceptance(
    request as RequestRow,
    proposal.start_date as string,
    proposal.end_date as string,
  );
  // Notify only on the FRESH confirmation (a materialization retry must
  // never re-notify the owner).
  if (!result.error && wasFreshTransition) {
    await notifyGuestSpotEvent({
      kind: "proposal_accepted",
      requestId,
      artistId,
      studioProfileId: (request as RequestRow).studio_profile_id,
      startDate: proposal.start_date as string,
      endDate: proposal.end_date as string,
    });
  }
  return result;
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
    // Include 'proposed': a crash between the artist's request hop and the
    // proposal's own status flip leaves the taken proposal still 'proposed'
    // (integration sweep finding); its dates are the agreed ones either way.
    const { data: acceptedProposal } = await serviceClient
      .from("guest_spot_proposals")
      .select("start_date, end_date")
      .eq("guest_spot_request_id", requestId)
      .in("status", ["accepted", "proposed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (acceptedProposal) {
      startsOn = acceptedProposal.start_date as string;
      endsOn = acceptedProposal.end_date as string;
    }
  }
  const wasFreshTransition = request.status !== "accepted";
  const result = await finishAcceptance(
    request as RequestRow,
    startsOn,
    endsOn,
  );
  // Fresh acceptance only: a materialization retry never re-notifies.
  if (!result.error && wasFreshTransition) {
    await notifyGuestSpotEvent({
      kind: "request_accepted",
      requestId,
      artistId: (request as RequestRow).artist_user_id,
      studioProfileId: studio.id,
      startDate: startsOn,
      endDate: endsOn,
    });
  }
  return result;
}

export async function passRequestCore(
  ownerId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const studio = await ownedStudio(ownerId);
  if (!studio) return { error: "Not your studio." };
  const { data: request } = await serviceClient
    .from("guest_spot_requests")
    .select("id, artist_user_id")
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
  await notifyGuestSpotEvent({
    kind: "request_passed",
    requestId,
    artistId: request.artist_user_id as string,
    studioProfileId: studio.id,
  });
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
  await notifyGuestSpotEvent({
    kind: "dates_suggested",
    requestId,
    artistId: request.artist_user_id as string,
    studioProfileId: studio.id,
    startDate,
    endDate,
  });
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
  // What was agreed, captured once at confirmation: the dates plus the house
  // rules as they stood. Later rule edits never rewrite history; the insert
  // path of the upsert below gives first-write-wins for free.
  const [{ data: studio }, { data: ruleRows }] = await Promise.all([
    serviceClient
      .from("studio_profiles")
      .select("name, city")
      .eq("id", request.studio_profile_id)
      .maybeSingle(),
    serviceClient
      .from("studio_house_rules")
      .select("rule_key, content")
      .eq("studio_profile_id", request.studio_profile_id),
  ]);
  const termsSnapshot = {
    captured_at: new Date().toISOString(),
    starts_on: startsOn,
    ends_on: endsOn,
    studio_name: (studio?.name as string | null) ?? null,
    house_rules: sortHouseRules(
      (ruleRows ?? []).map((r) => ({
        key: r.rule_key as string,
        content: r.content as string,
      })),
    ),
  };

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
        terms_snapshot: termsSnapshot,
      },
      { onConflict: "guest_spot_request_id", ignoreDuplicates: true },
    )
    .select("id, trip_leg_id, starts_on, ends_on, status")
    .maybeSingle();
  let stay = insertedStay;
  if (!stay) {
    const { data: existingStay } = await serviceClient
      .from("guest_spot_stays")
      .select("id, trip_leg_id, starts_on, ends_on, status")
      .eq("guest_spot_request_id", request.id)
      .maybeSingle();
    stay = existingStay ?? null;
  }
  if (stayErr && !stay)
    return { error: "Could not record the stay. Try accepting again." };
  if (!stay)
    return { error: "Could not record the stay. Try accepting again." };

  // A dead stay must never be resurrected: a cancelled stay has trip_leg_id
  // null (the leg was removed), so without this gate a retry-accept would
  // materialize a phantom locked trip for a stay nobody is taking. Heal the
  // request to match and stop.
  if (["cancelled", "no_show"].includes(stay.status as string)) {
    await transitionRequest(
      request.id,
      ["accepted", "awaiting_confirmation", "confirmed"],
      "cancelled",
    );
    return {
      error:
        "This guest spot was cancelled. The artist can send a new request.",
    };
  }

  // A pre-existing stay is the source of truth for the agreed dates: a retry
  // must never re-date a half-materialized acceptance.
  const legStartsOn = (stay.starts_on as string) ?? startsOn;
  const legEndsOn = (stay.ends_on as string) ?? endsOn;

  // 2. Materialize the trip + leg once.
  if (!stay.trip_leg_id) {
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
    // The request follows the stay from EVERY state that can hold a live
    // stay: accepted and awaiting_confirmation are the retryable
    // materialization intermediates, and leaving them open would occupy the
    // one-open-request slot forever (integration sweep finding).
    await transitionRequest(
      stay.guest_spot_request_id as string,
      ["accepted", "awaiting_confirmation", "confirmed"],
      "cancelled",
    );
  }
  // The other party learns about the cancellation (feed + push + email).
  await notifyGuestSpotEvent({
    kind: "stay_cancelled",
    requestId: (stay.guest_spot_request_id as string | null) ?? null,
    artistId: stay.artist_user_id as string,
    studioProfileId: stay.studio_profile_id as string,
    cancelledBy: isArtist ? "artist" : "studio",
  });
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
    // What was agreed at confirmation (dates + house rules then), immune to
    // later edits. Null on stays confirmed before the snapshot shipped.
    termsSnapshot: {
      capturedAt: string | null;
      houseRules: Array<{ key: string; content: string }>;
    } | null;
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
      .select("id, starts_on, ends_on, status, terms_snapshot")
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
          termsSnapshot: (() => {
            const raw = stay.terms_snapshot as {
              captured_at?: unknown;
              house_rules?: unknown;
            } | null;
            if (!raw || typeof raw !== "object") return null;
            const rules = Array.isArray(raw.house_rules)
              ? raw.house_rules.filter(
                  (r): r is { key: string; content: string } =>
                    Boolean(
                      r &&
                      typeof (r as { key?: unknown }).key === "string" &&
                      typeof (r as { content?: unknown }).content === "string",
                    ),
                )
              : [];
            return {
              capturedAt:
                typeof raw.captured_at === "string" ? raw.captured_at : null,
              // Canonical order at parse too, healing early snapshots.
              houseRules: sortHouseRules(rules),
            };
          })(),
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

// ---------------------------------------------------------------------------
// Trip deletion with the guest spot lock (integration sweep fix): a trip or
// leg tied to a LIVE stay (confirmed/active) stays locked behind the cancel
// flow, but once the stay is terminal (completed/cancelled/no_show) or gone,
// the artist may clean up their calendar. Terminal-state deletes must run
// service-role because the DB trigger blocks client writes on guest_spot
// legs unconditionally.

async function guestLegsLive(
  legIds: Array<{ id: string; stayId: string | null }>,
): Promise<boolean> {
  const stayIds = legIds
    .map((l) => l.stayId)
    .filter((id): id is string => Boolean(id));
  if (!stayIds.length) return false;
  const { data, error } = await serviceClient
    .from("guest_spot_stays")
    .select("id")
    .in("id", stayIds)
    .in("status", ["confirmed", "active"])
    .limit(1);
  // Fail closed: if the lock cannot be read, keep the trip locked.
  if (error) return true;
  return Boolean(data?.length);
}

export async function deleteTripCore(
  userId: string,
  tripId: string,
): Promise<{ error?: string }> {
  const { data: trip } = await serviceClient
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("artist_id", userId)
    .maybeSingle();
  if (!trip) return { error: "Trip not found." };
  const { data: legs } = await serviceClient
    .from("trip_legs")
    .select("id, origin, guest_spot_stay_id")
    .eq("trip_id", tripId);
  const guestLegs = (legs ?? []).filter((l) => l.origin === "guest_spot");
  if (guestLegs.length) {
    const live = await guestLegsLive(
      guestLegs.map((l) => ({
        id: l.id as string,
        stayId: (l.guest_spot_stay_id as string | null) ?? null,
      })),
    );
    if (live) return { error: GUEST_SPOT_LEG_LOCKED_MESSAGE };
  }
  const { error } = await serviceClient
    .from("trips")
    .delete()
    .eq("id", tripId)
    .eq("artist_id", userId);
  if (error) return { error: "Could not remove the trip. Try again." };
  return {};
}

export async function deleteTripLegCore(
  userId: string,
  legId: string,
): Promise<{ error?: string }> {
  const { data: leg } = await serviceClient
    .from("trip_legs")
    .select("id, origin, guest_spot_stay_id, trips!inner(artist_id)")
    .eq("id", legId)
    .eq("trips.artist_id", userId)
    .maybeSingle();
  if (!leg) return { error: "Trip stop not found." };
  if ((leg.origin as string) === "guest_spot") {
    const live = await guestLegsLive([
      {
        id: leg.id as string,
        stayId: (leg.guest_spot_stay_id as string | null) ?? null,
      },
    ]);
    if (live) return { error: GUEST_SPOT_LEG_LOCKED_MESSAGE };
  }
  const { error } = await serviceClient
    .from("trip_legs")
    .delete()
    .eq("id", legId);
  if (error) return { error: "Could not remove the stop. Try again." };
  return {};
}

// ---------------------------------------------------------------------------
// Guest artist timeline (Phase 4, Q16 resolved 2026-07-18): a read model over
// stays for a studio's map page. Studio opts in (show_guest_timeline);
// artist privacy caps every entry: only passport_public artists render
// named + linked, everyone else appears as "A guest artist" with dates only.

export type TimelineEntry = {
  // null name = anonymized entry (the Q16 default).
  name: string | null;
  slug: string | null;
  startsOn: string;
  endsOn: string;
};

export type StudioTimeline = {
  current: TimelineEntry[];
  upcoming: TimelineEntry[];
  past: TimelineEntry[];
};

/**
 * Returns the timeline, or null when the studio has not opted in or is not
 * published. Callers pass the studio profile id from an approved map page.
 */
export async function getStudioGuestTimeline(
  studioProfileId: string,
): Promise<StudioTimeline | null> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("publication_status, show_guest_timeline")
    .eq("id", studioProfileId)
    .maybeSingle();
  if (studio?.publication_status !== "published" || !studio.show_guest_timeline)
    return null;

  // Per-status queries so no group can starve another out of a shared limit.
  const base = () =>
    serviceClient
      .from("guest_spot_stays")
      .select("artist_user_id, starts_on, ends_on")
      .eq("studio_profile_id", studioProfileId);
  const [{ data: current }, { data: upcoming }, { data: past }] =
    await Promise.all([
      base()
        .eq("status", "active")
        .order("starts_on", { ascending: true })
        .limit(10),
      base()
        .eq("status", "confirmed")
        .order("starts_on", { ascending: true })
        .limit(10),
      base()
        .eq("status", "completed")
        .order("ends_on", { ascending: false })
        .limit(8),
    ]);

  // Naming consent: passport_public covers the artist's completed guest spot
  // HISTORY, so only PAST entries carry a name and link. Current and upcoming
  // stays render anonymized for everyone in v1: naming future whereabouts is
  // a bigger consent than the passport toggle promises, and bundling it in
  // silently is not this slice's call (founder decision pending).
  const pastArtistIds = [
    ...new Set((past ?? []).map((s) => s.artist_user_id as string)),
  ];
  const { data: artists } = pastArtistIds.length
    ? await serviceClient
        .from("profiles")
        .select("id, display_name, slug, passport_public")
        .in("id", pastArtistIds)
    : { data: [] };
  const byId = new Map(
    (artists ?? []).map((a) => [
      a.id as string,
      {
        name: a.passport_public
          ? (((a.display_name as string | null) || (a.slug as string | null)) ??
            null)
          : null,
        slug: a.passport_public ? ((a.slug as string | null) ?? null) : null,
      },
    ]),
  );

  const anonymized = (s: {
    starts_on: unknown;
    ends_on: unknown;
  }): TimelineEntry => ({
    name: null,
    slug: null,
    startsOn: s.starts_on as string,
    endsOn: s.ends_on as string,
  });

  return {
    current: (current ?? []).map(anonymized),
    upcoming: (upcoming ?? []).map(anonymized),
    past: (past ?? []).map((s) => {
      const artist = byId.get(s.artist_user_id as string);
      return {
        name: artist?.name ?? null,
        slug: artist?.slug ?? null,
        startsOn: s.starts_on as string,
        endsOn: s.ends_on as string,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Artist passport (Phase 4): a read model over completed stays. Private by
// default; profiles.passport_public (toggle on /settings/map, grant 0084)
// opts the artist in. Shown to studios reviewing that artist's request.

export type ArtistPassport = {
  completedCount: number;
  recent: Array<{ studioName: string; city: string | null; endedOn: string }>;
};

/**
 * Returns the passport, or null when the artist has not opted in (callers
 * showing an artist their OWN passport pass includePrivate: true).
 */
export async function getArtistPassport(
  artistUserId: string,
  options?: { includePrivate?: boolean },
): Promise<ArtistPassport | null> {
  if (!options?.includePrivate) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("passport_public")
      .eq("id", artistUserId)
      .maybeSingle();
    if (!profile?.passport_public) return null;
  }
  const [{ count }, { data: stays }] = await Promise.all([
    serviceClient
      .from("guest_spot_stays")
      .select("id", { count: "exact", head: true })
      .eq("artist_user_id", artistUserId)
      .eq("status", "completed"),
    serviceClient
      .from("guest_spot_stays")
      .select("studio_profile_id, ends_on")
      .eq("artist_user_id", artistUserId)
      .eq("status", "completed")
      .order("ends_on", { ascending: false })
      .limit(5),
  ]);
  const studioIds = [
    ...new Set((stays ?? []).map((s) => s.studio_profile_id as string)),
  ];
  const { data: studios } = studioIds.length
    ? await serviceClient
        .from("studio_profiles")
        .select("id, name, city")
        .in("id", studioIds)
    : { data: [] };
  const byId = new Map(
    (studios ?? []).map((s) => [
      s.id as string,
      { name: s.name as string, city: (s.city as string | null) ?? null },
    ]),
  );
  // Deduped by studio: repeat visits are the normal guest spot pattern, and
  // "Black Lotus and Black Lotus" reads as a bug.
  const seenStudios = new Set<string>();
  const recent: ArtistPassport["recent"] = [];
  for (const s of stays ?? []) {
    const studioId = s.studio_profile_id as string;
    if (seenStudios.has(studioId)) continue;
    seenStudios.add(studioId);
    const studio = byId.get(studioId);
    recent.push({
      studioName: studio?.name ?? "A studio",
      city: studio?.city ?? null,
      endedOn: s.ends_on as string,
    });
  }
  return { completedCount: count ?? 0, recent };
}

/**
 * Date-driven stay lifecycle (cron-invoked, idempotent): confirmed stays
 * activate on their start date, active stays complete after their end date,
 * and the completed stay's request follows (confirmed -> completed). Runs
 * regardless of the UI flag: it is data hygiene, and empty tables make it a
 * no-op. WHERE clauses mirror dueStayTransition in the shared module.
 */
export async function runStayLifecycleSweep(): Promise<{
  activated: number;
  completed: number;
  requestsCompleted: number;
}> {
  const today = todayKey();
  const nowIso = new Date().toISOString();

  const { data: activated, error: activateErr } = await serviceClient
    .from("guest_spot_stays")
    .update({ status: "active", updated_at: nowIso })
    .eq("status", "confirmed")
    .lte("starts_on", today)
    .select("id");
  if (activateErr)
    console.error("[guest-spots] stay activation failed:", activateErr.message);

  const { data: completed, error: completeErr } = await serviceClient
    .from("guest_spot_stays")
    .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
    .eq("status", "active")
    .lt("ends_on", today)
    .select("id");
  if (completeErr)
    console.error("[guest-spots] stay completion failed:", completeErr.message);

  // Heal requests stranded in 'accepted' whose stay is alive or done (a
  // crash between materialization and the confirm hop): accepted -> confirmed
  // is FSM-legal, and the completed follow-up below then catches them.
  const { data: liveStays } = await serviceClient
    .from("guest_spot_stays")
    .select("guest_spot_request_id")
    .in("status", ["confirmed", "active", "completed"])
    .not("guest_spot_request_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);
  const liveRequestIds = (liveStays ?? [])
    .map((s) => s.guest_spot_request_id as string | null)
    .filter((id): id is string => Boolean(id));
  if (liveRequestIds.length) {
    const { error: healErr } = await serviceClient
      .from("guest_spot_requests")
      .update({ status: "confirmed", updated_at: nowIso })
      .in("id", liveRequestIds)
      .eq("status", "accepted");
    if (healErr)
      console.error("[guest-spots] accepted-heal failed:", healErr.message);
  }

  // State-driven, not delta-driven: derive the request follow-up from every
  // completed stay (recent first), so a crash between the two steps self-heals
  // on the next run instead of stranding a request in confirmed forever. The
  // .eq status guard keeps re-runs cheap no-ops.
  let requestsCompleted = 0;
  const { data: completedStays } = await serviceClient
    .from("guest_spot_stays")
    .select("guest_spot_request_id")
    .eq("status", "completed")
    .not("guest_spot_request_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);
  const requestIds = (completedStays ?? [])
    .map((s) => s.guest_spot_request_id as string | null)
    .filter((id): id is string => Boolean(id));
  if (requestIds.length) {
    const { data: movedRequests, error: requestErr } = await serviceClient
      .from("guest_spot_requests")
      .update({ status: "completed", updated_at: nowIso })
      .in("id", requestIds)
      .eq("status", "confirmed")
      .select("id");
    if (requestErr)
      console.error(
        "[guest-spots] request completion failed:",
        requestErr.message,
      );
    requestsCompleted = movedRequests?.length ?? 0;
  }

  return {
    activated: activated?.length ?? 0,
    completed: completed?.length ?? 0,
    requestsCompleted,
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
