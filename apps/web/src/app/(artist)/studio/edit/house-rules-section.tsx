"use client";

import { useState, useTransition } from "react";
import {
  HOUSE_RULE_CONTENT_MAX,
  HOUSE_RULE_KEYS,
  HOUSE_RULE_LABELS,
  sortHouseRules,
  type HouseRuleKey,
} from "@inklee/shared/studio-profile";
import { setHouseRulesAction } from "../actions";

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export default function HouseRulesSection({
  studioId,
  initialRules,
}: {
  studioId: string;
  initialRules: Array<{ key: string; content: string }>;
}) {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const usedKeys = new Set(rules.map((r) => r.key));
  const available = HOUSE_RULE_KEYS.filter((k) => !usedKeys.has(k));

  const addRule = (key: HouseRuleKey) => {
    setSaved(false);
    setRules(sortHouseRules([...rules, { key, content: "" }]));
  };

  const updateRule = (key: string, content: string) => {
    setSaved(false);
    setRules(rules.map((r) => (r.key === key ? { ...r, content } : r)));
  };

  const removeRule = (key: string) => {
    setSaved(false);
    setRules(rules.filter((r) => r.key !== key));
  };

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setHouseRulesAction(studioId, rules);
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
        <h2 className="text-sm font-semibold text-foreground">House rules</h2>
        <p className="text-xs text-muted-foreground">
          What guest artists should know before they ask: deposits, cleaning,
          access, promotion. Shown to artists who look at your studio, and part
          of the welcome pack later.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rules yet. Add the ones that matter for your studio.
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">
                  {HOUSE_RULE_LABELS[rule.key as HouseRuleKey] ?? rule.key}
                </span>
                <button
                  type="button"
                  onClick={() => removeRule(rule.key)}
                  disabled={pending}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={rule.content}
                onChange={(e) => updateRule(rule.key, e.target.value)}
                maxLength={HOUSE_RULE_CONTENT_MAX}
                rows={2}
                className={INPUT_CLS}
              />
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {available.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => addRule(key)}
              disabled={pending}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              + {HOUSE_RULE_LABELS[key]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save house rules"}
        </button>
        {saved ? (
          <span className="text-xs text-muted-foreground">Saved.</span>
        ) : null}
        {error ? <span className="text-xs text-brand-red">{error}</span> : null}
      </div>
    </section>
  );
}
