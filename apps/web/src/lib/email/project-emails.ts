import { sendEmail } from "./send";
import {
  PROJECT_STATUS_META,
  type ProjectStatus,
} from "@inklee/shared/projects";

// Large-project emails (Plus build P4 follow-up).
//
// v1 sends three, and deliberately no more:
//
//   1. the client's receipt, carrying their portal link,
//   2. the artist's new-enquiry alert,
//   3. one status update to the client, on the transitions that mean
//      something to them.
//
// Not artist-customisable in v1. Custom email templates are their own gated
// capability with their own editor, and adding a fourth template family to it
// before anyone has sent a single project email would be guessing at what
// artists want to change.
//
// Every send is best-effort and swallows its error, matching every other
// sender here: an email provider outage must never fail the intake that
// produced a real project record.

const PORTAL_NOTE =
  "Keep this link. It is the only way back to this page, and it is personal to you.";

export async function sendProjectReceivedClient({
  to,
  artistName,
  projectTitle,
  portalUrl,
}: {
  to: string;
  artistName: string;
  projectTitle: string;
  portalUrl: string;
}): Promise<void> {
  try {
    const body = `Hi,

Your project enquiry is with ${artistName}.

${projectTitle}

Big projects take a conversation before any dates get set, so give them a little time to come back to you. You can check where things stand any time:

${portalUrl}

${PORTAL_NOTE}`;
    const { buildEmailHtml } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `Your project enquiry is with ${artistName}`,
      html: buildEmailHtml(body, {}, undefined, {
        ctaLabel: "View my project",
      }),
    });
  } catch (err) {
    console.error("[email] project received (client) failed:", err);
  }
}

export async function sendProjectReceivedArtist({
  to,
  projectTitle,
  clientLabel,
  scaleLabel,
  areasLabel,
  projectUrl,
}: {
  to: string;
  projectTitle: string;
  clientLabel: string;
  scaleLabel: string | null;
  areasLabel: string | null;
  projectUrl: string;
}): Promise<void> {
  try {
    const details = [scaleLabel, areasLabel].filter(Boolean).join(" · ");
    const body = `Hi,

${clientLabel} sent you a project enquiry.

${projectTitle}${details ? `\n${details}` : ""}

${projectUrl}`;
    const { buildEmailHtml } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: `New project enquiry: ${projectTitle}`,
      html: buildEmailHtml(body, {}, undefined, {
        ctaLabel: "Open the project",
      }),
    });
  } catch (err) {
    console.error("[email] project received (artist) failed:", err);
  }
}

/**
 * The statuses worth emailing a client about, and what to say.
 *
 * `submitted` is absent because the receipt above already covered it, and
 * `archived` is absent because archiving is the artist tidying their own list,
 * which is not news to the client. `under_review` is absent for the same
 * reason: "someone is thinking about it" is not an update.
 */
const CLIENT_STATUS_COPY: Partial<
  Record<ProjectStatus, { subject: (a: string) => string; body: string }>
> = {
  consultation: {
    subject: (a) => `${a} wants to talk about your project`,
    body: "They would like to talk it through before any dates get set. Expect to hear from them directly.",
  },
  active: {
    subject: (a) => `${a} is taking on your project`,
    body: "It is going ahead. Sessions get booked as they are scheduled, and you will see them on your project page.",
  },
  completed: {
    subject: (a) => `Your project with ${a} is finished`,
    body: "That is the whole thing done. Thank you for sitting through it.",
  },
  declined: {
    subject: (a) => `${a} has passed on your project`,
    body: "They are not able to take this one on. Nothing else is needed from you.",
  },
};

export function clientNotifiableStatus(status: ProjectStatus): boolean {
  return status in CLIENT_STATUS_COPY;
}

export async function sendProjectStatusClient({
  to,
  artistName,
  projectTitle,
  status,
  portalUrl,
}: {
  to: string;
  artistName: string;
  projectTitle: string;
  status: ProjectStatus;
  portalUrl: string;
}): Promise<void> {
  const copy = CLIENT_STATUS_COPY[status];
  if (!copy) return;
  try {
    const body = `Hi,

${projectTitle}

${copy.body}

${portalUrl}`;
    const { buildEmailHtml } = await import("./booking-templates");
    await sendEmail({
      to,
      subject: copy.subject(artistName),
      html: buildEmailHtml(body, {}, undefined, {
        ctaLabel: "View my project",
      }),
    });
  } catch (err) {
    console.error("[email] project status (client) failed:", err);
  }
}

/** Exported for the tests that pin the copy rules over every string here. */
export const PROJECT_CLIENT_STATUS_COPY = CLIENT_STATUS_COPY;
export { PROJECT_STATUS_META };
