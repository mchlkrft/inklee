"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_WELCOME_PACK_FILES,
  WELCOME_PACK_FIELDS,
  WELCOME_PACK_FIELD_LABELS,
  WELCOME_PACK_FIELD_MAX,
  type WelcomePackField,
  type WelcomePackInput,
} from "@inklee/shared/studio-profile";
import type { WelcomePackFile } from "@/lib/server/studios";
import {
  deleteWelcomePackFileAction,
  setWelcomePackAction,
  uploadWelcomePackFileAction,
} from "../actions";

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const PLACEHOLDERS: Record<WelcomePackField, string> = {
  access_details: "Door code, which bell, where to park.",
  wifi: "Network name and password.",
  emergency_contact: "Who to call when something goes wrong.",
  supply_shops: "Where to get needles and ink nearby.",
  promotion_notes: "Tag us, story templates, what to post.",
  local_notes: "Food, coffee, what to see after work.",
};

export default function WelcomePackSection({
  studioId,
  initial,
  files,
}: {
  studioId: string;
  initial: WelcomePackInput;
  files: WelcomePackFile[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<WelcomePackInput>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [filePending, startFile] = useTransition();

  const upload = (file: File) => {
    setFileError(null);
    // Clear immediately so re-picking the same file after a failure fires
    // a fresh change event.
    if (fileInput.current) fileInput.current.value = "";
    startFile(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const result = await uploadWelcomePackFileAction(studioId, fd);
      if (result.error) {
        setFileError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const removeFile = (fileId: string) => {
    setFileError(null);
    startFile(async () => {
      const result = await deleteWelcomePackFileAction(studioId, fileId);
      if (result.error) {
        setFileError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const setField = (field: WelcomePackField, value: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [field]: value }));
  };

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setWelcomePackAction(studioId, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Welcome pack</h2>
        <p className="text-xs text-muted-foreground">
          What a confirmed guest artist needs on arrival. Only artists with a
          confirmed stay see this; it never shows on your public page.
        </p>
      </div>

      <ul className="space-y-3">
        {WELCOME_PACK_FIELDS.map((field) => (
          <li key={field} className="space-y-1">
            <label className="text-sm text-foreground" htmlFor={`wp-${field}`}>
              {WELCOME_PACK_FIELD_LABELS[field]}
            </label>
            <textarea
              id={`wp-${field}`}
              value={values[field] ?? ""}
              onChange={(e) => setField(field, e.target.value)}
              maxLength={WELCOME_PACK_FIELD_MAX}
              rows={2}
              placeholder={PLACEHOLDERS[field]}
              className={INPUT_CLS}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Your house rules already show alongside the pack on the guest&apos;s
        request page.
      </p>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm text-foreground">Files</p>
        <p className="text-xs text-muted-foreground">
          Access maps, forms, anything a guest needs on paper. PDF or image, up
          to {MAX_WELCOME_PACK_FILES} files, 4 MB each. Only confirmed guests
          can open them.
        </p>
        {files.length > 0 ? (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-foreground underline-offset-2 hover:underline"
                  >
                    {f.fileName}
                  </a>
                ) : (
                  <span className="min-w-0 truncate text-foreground">
                    {f.fileName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  disabled={filePending}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length < MAX_WELCOME_PACK_FILES ? (
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            disabled={filePending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="block text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:text-foreground"
          />
        ) : null}
        {filePending ? (
          <p className="text-xs text-muted-foreground">Working…</p>
        ) : null}
        {fileError ? (
          <p className="text-xs text-brand-red">{fileError}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save welcome pack"}
        </button>
        {saved ? (
          <span className="text-xs text-muted-foreground">Saved.</span>
        ) : null}
        {error ? <span className="text-xs text-brand-red">{error}</span> : null}
      </div>
    </section>
  );
}
