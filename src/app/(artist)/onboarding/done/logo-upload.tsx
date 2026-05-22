"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import Spinner from "@/components/spinner";
import { uploadOnboardingLogoAction } from "./actions";

type State = { error: string } | { success: true } | null;

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const [state, action, pending] = useActionState<State, FormData>(
    uploadOnboardingLogoAction,
    null,
  );
  const [preview, setPreview] = useState<string | null>(logoUrl);
  // Validation that happens before we ever submit — keeps oversized /
  // unsupported files (e.g. a 10 MB iPhone HEIC photo) from hitting the
  // server action, where they'd be rejected as an unhandled 500.
  const [clientError, setClientError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      name.endsWith(".heic") ||
      name.endsWith(".heif");

    if (isHeic) {
      setClientError(
        "iPhone HEIC photos aren’t supported. Choose a JPG or PNG — a screenshot of the photo works too.",
      );
      e.target.value = "";
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setClientError(
        "That file isn’t supported — please choose a PNG, JPG, or WebP image.",
      );
      e.target.value = "";
      return;
    }
    if (file.size > MAX_SIZE) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setClientError(
        `That image is ${mb} MB — too large. Please choose one under 2 MB.`,
      );
      e.target.value = "";
      return;
    }

    setPreview(URL.createObjectURL(file));
    formRef.current?.requestSubmit();
  }

  // Client validation takes precedence; otherwise surface the server result.
  const errorMessage =
    clientError ?? (state && "error" in state ? state.error : null);
  const showSuccess = !clientError && state !== null && "success" in state;

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-md border border-border p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Add your logo (optional)
        </p>
      </div>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative h-16 w-16 rounded-full overflow-hidden border border-border shrink-0">
            <Image src={preview} alt="logo" fill className="object-cover" />
          </div>
        ) : (
          <div className="h-16 w-16 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs shrink-0">
            None
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            {pending ? (
              <Spinner className="h-3 w-3" />
            ) : preview ? (
              "Replace"
            ) : (
              "Choose image"
            )}
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            PNG, JPG, WebP — max 2 MB
          </p>
        </div>
        <input
          ref={fileRef}
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
      {showSuccess && <p className="text-xs text-green-500">Logo saved.</p>}
    </form>
  );
}
