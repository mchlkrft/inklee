"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon } from "lucide-react";
import Spinner from "@/components/spinner";
import { uploadOnboardingLogoAction } from "./actions";

type State = { error: string } | { success: true } | null;

export default function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const [state, action, pending] = useActionState<State, FormData>(
    uploadOnboardingLogoAction,
    null,
  );
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPreview(URL.createObjectURL(file));
              formRef.current?.requestSubmit();
            }
          }}
        />
      </div>
      {state && "error" in state && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-xs text-green-500">Logo saved.</p>
      )}
    </form>
  );
}
