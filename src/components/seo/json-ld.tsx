type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
};

export default function JsonLd({ data, id }: JsonLdProps) {
  const payload = JSON.stringify(data, (_key, value) =>
    value === undefined ? undefined : value,
  );
  return (
    <script
      type="application/ld+json"
      id={id}
      dangerouslySetInnerHTML={{ __html: payload }}
    />
  );
}
