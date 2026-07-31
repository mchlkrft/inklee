import { describe, it, expect } from "vitest";
import { gateMediaBlocksForSave, type BioBlock } from "@inklee/shared/bio-page";

// The save-path entitlement gate for image_gallery (the render already hides it;
// this stops a Free artist PERSISTING a new/changed gallery, while preserving an
// existing unchanged one on an unrelated edit — decision D2).

const link = (id: string): BioBlock => ({
  id,
  type: "link",
  label: "Book",
  url: "https://example.com",
  isActive: true,
});

const gallery = (id: string, url: string): BioBlock => ({
  id,
  type: "image_gallery",
  images: [{ url }],
  layout: "grid",
});

describe("gateMediaBlocksForSave", () => {
  it("is the identity function when entitled", () => {
    const proposed = [link("l1"), gallery("g1", "https://cdn/a.jpg")];
    const r = gateMediaBlocksForSave(proposed, [], true);
    expect(r.blocks).toEqual(proposed);
    expect(r.droppedMedia).toBe(0);
  });

  it("drops a NEW gallery block for an unentitled artist, keeps non-media", () => {
    const proposed = [link("l1"), gallery("g1", "https://cdn/a.jpg")];
    const r = gateMediaBlocksForSave(proposed, [], false);
    expect(r.blocks).toEqual([link("l1")]);
    expect(r.droppedMedia).toBe(1);
  });

  it("KEEPS an existing unchanged gallery (downgrade hides, never deletes)", () => {
    const existing = gallery("g1", "https://cdn/a.jpg");
    const proposed = [link("l1"), existing];
    const r = gateMediaBlocksForSave(proposed, [existing], false);
    expect(r.blocks).toEqual(proposed);
    expect(r.droppedMedia).toBe(0);
  });

  it("drops a CHANGED gallery even if an id-matching one existed", () => {
    const before = gallery("g1", "https://cdn/a.jpg");
    const after = gallery("g1", "https://cdn/CHANGED.jpg");
    const r = gateMediaBlocksForSave([after], [before], false);
    expect(r.blocks).toEqual([]);
    expect(r.droppedMedia).toBe(1);
  });

  it("drops a new gallery reusing an id whose existing block was NOT a gallery", () => {
    // An id collision with a non-media block must not smuggle a gallery through.
    const r = gateMediaBlocksForSave(
      [gallery("x", "https://cdn/a.jpg")],
      [link("x")],
      false,
    );
    expect(r.blocks).toEqual([]);
    expect(r.droppedMedia).toBe(1);
  });

  it("keeps all non-media blocks untouched regardless of entitlement", () => {
    const proposed = [link("l1"), link("l2")];
    expect(gateMediaBlocksForSave(proposed, [], false).blocks).toEqual(
      proposed,
    );
  });
});
