"use client";

import { useEffect, useRef, useState } from "react";
import TemplateEditor from "./template-editor";

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

export type TemplateData = {
  type: EmailType;
  label: string;
  subject: string;
  body: string;
  systemDefault: string;
  enabled: boolean;
};

export default function EmailTemplatesList({
  templates,
  allowedVars,
}: {
  templates: TemplateData[];
  allowedVars: string[];
}) {
  const [openType, setOpenType] = useState<EmailType | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = (type: EmailType) => setOpenType(type);
  const close = () => setOpenType(null);

  // Sync dialog open/close with state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openType) {
      dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [openType]);

  // Sync state when Escape closes the dialog natively
  function handleDialogClose() {
    setOpenType(null);
  }

  // Close when clicking the backdrop (outside the panel)
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) close();
  }

  const activeTemplate = templates.find((t) => t.type === openType) ?? null;

  return (
    <>
      {/* Card list */}
      <div className="rounded-md border border-border divide-y divide-border">
        {templates.map(
          ({ type, label, subject, enabled, body, systemDefault }) => {
            const isCustomised = body !== systemDefault;
            return (
              <button
                key={type}
                type="button"
                onClick={() => open(type)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/20"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {label}
                    </p>
                    {isCustomised && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Edited
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {subject}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs ${enabled ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {enabled ? "On" : "Off"}
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                </div>
              </button>
            );
          },
        )}
      </div>

      {/* Modal */}
      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        onClick={handleBackdropClick}
        className="m-auto w-full max-w-xl rounded-md border border-border bg-background p-0 shadow-2xl outline-none"
      >
        {activeTemplate && (
          <div className="flex flex-col">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {activeTemplate.label}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {activeTemplate.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none mt-0.5"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Variables reference */}
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Variables:{" "}
                {allowedVars.map((v) => (
                  <code key={v} className="mr-1.5 font-mono">{`{{${v}}}`}</code>
                ))}
              </p>
            </div>

            {/* Editor */}
            <div className="px-5 py-5">
              <TemplateEditor
                key={activeTemplate.type}
                type={activeTemplate.type}
                defaultBody={activeTemplate.body}
                systemDefault={activeTemplate.systemDefault}
                defaultEnabled={activeTemplate.enabled}
                onSaveSuccess={close}
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
