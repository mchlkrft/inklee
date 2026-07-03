import { describe, it, expect } from "vitest";
import {
  supportTicketCreatedArtistEmail,
  supportTicketCreatedTeamEmail,
  supportAdminRepliedEmail,
  supportArtistRepliedTeamEmail,
  supportStatusChangedEmail,
} from "@/lib/email/support-templates";

const XSS = `<script>alert("x")</script>`;

describe("support email templates", () => {
  it("artist confirmation includes reference and ticket link, escapes the subject", () => {
    const html = supportTicketCreatedArtistEmail({
      reference: "INK-1042",
      subject: XSS,
      ticketUrl: "https://inklee.app/support/abc",
    });
    expect(html).toContain("INK-1042");
    expect(html).toContain("https://inklee.app/support/abc");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("team notification carries the artist identity and admin deep link, escaped", () => {
    const html = supportTicketCreatedTeamEmail({
      reference: "INK-1042",
      subject: "Broken page",
      categoryLabel: "Public booking page",
      artistName: `Mo <b>bold</b>`,
      artistEmail: "mo@example.com",
      createdAt: "2026-07-04T10:00:00Z",
      adminUrl: "https://inklee.app/admin/support/abc",
    });
    expect(html).toContain("INK-1042");
    expect(html).toContain("Public booking page");
    expect(html).toContain("mo@example.com");
    expect(html).toContain("https://inklee.app/admin/support/abc");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("reply notifications never contain a message body parameter at all", () => {
    const html = supportAdminRepliedEmail({
      reference: "INK-7",
      subject: "Calendar",
      ticketUrl: "https://inklee.app/support/x",
    });
    // The platform is the source of truth: the email only announces a reply.
    expect(html).toContain("new reply");
    expect(html).toContain("https://inklee.app/support/x");
  });

  it("artist-replied team email names the artist", () => {
    const html = supportArtistRepliedTeamEmail({
      reference: "INK-7",
      subject: "Calendar",
      artistName: "Bert Grimm",
      artistEmail: "bert@example.com",
      adminUrl: "https://inklee.app/admin/support/x",
    });
    expect(html).toContain("Bert Grimm");
    expect(html).toContain("bert@example.com");
  });

  it("status email states the new status", () => {
    const html = supportStatusChangedEmail({
      reference: "INK-9",
      subject: "Deposits",
      statusLabel: "Resolved",
      ticketUrl: "https://inklee.app/support/y",
    });
    expect(html).toContain("resolved");
    expect(html).toContain("INK-9");
  });
});
