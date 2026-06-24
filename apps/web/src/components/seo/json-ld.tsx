type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
};

/** SEO-01: serialize for an inline <script> safely. Escape `<` (so a future
 *  user-controlled string containing "</script>" can't break out of the tag)
 *  plus U+2028/U+2029, the two line-separator code points that are valid in
 *  JSON but break an inline script. Compared by code point so no literal
 *  separator char is needed in source. Exported for testing. */
export function serializeJsonLd(
  data: Record<string, unknown> | Record<string, unknown>[],
): string {
  const json = JSON.stringify(data, (_key, value) =>
    value === undefined ? undefined : value,
  );
  let out = "";
  for (const ch of json) {
    const code = ch.charCodeAt(0);
    if (ch === "<") out += "\\u003c";
    else if (code === 0x2028 || code === 0x2029)
      out += "\\u" + code.toString(16);
    else out += ch;
  }
  return out;
}

export default function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
