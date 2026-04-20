"use client";

import type { CustomFieldDef } from "@/lib/custom-fields";

const BASE =
  "w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export default function CustomFieldInput({
  field,
  error,
}: {
  field: CustomFieldDef;
  error: string | null;
}) {
  const name = `cf_${field.key}`;
  const required = field.required;
  const placeholder = field.placeholder ?? undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm text-muted-foreground">
        {field.label}
        {required ? (
          <span className="text-foreground"> *</span>
        ) : (
          <span className="text-muted-foreground text-xs"> (optional)</span>
        )}
      </label>

      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}

      {field.type === "short_text" && (
        <input
          id={name}
          name={name}
          type="text"
          required={required}
          placeholder={placeholder}
          maxLength={200}
          className={BASE}
        />
      )}

      {field.type === "long_text" && (
        <textarea
          id={name}
          name={name}
          required={required}
          rows={4}
          placeholder={placeholder}
          maxLength={1000}
          className={`${BASE} resize-none`}
        />
      )}

      {field.type === "number" && (
        <input
          id={name}
          name={name}
          type="number"
          required={required}
          placeholder={placeholder}
          className={BASE}
        />
      )}

      {field.type === "date" && (
        <input
          id={name}
          name={name}
          type="date"
          required={required}
          className={`${BASE} bg-background`}
        />
      )}

      {field.type === "checkbox" && (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            id={name}
            name={name}
            type="checkbox"
            value="on"
            required={required}
            className="accent-foreground"
          />
          <span className="text-sm text-muted-foreground">yes</span>
        </label>
      )}

      {field.type === "select" && (
        <select
          id={name}
          name={name}
          required={required}
          defaultValue=""
          className={`${BASE} bg-background`}
        >
          <option value="" disabled>
            {placeholder ?? "select one…"}
          </option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.type === "radio" && (
        <div className="space-y-2">
          {field.options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm cursor-pointer has-[:checked]:border-foreground has-[:checked]:text-foreground text-muted-foreground"
            >
              <input
                type="radio"
                name={name}
                value={opt}
                required={required}
                className="accent-foreground"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
