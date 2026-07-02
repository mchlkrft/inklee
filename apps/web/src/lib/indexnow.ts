import { MARKETING_ORIGIN, MARKETING_URLS } from "@/lib/marketing-routes";

/**
 * IndexNow submission helper.
 *
 * IndexNow instantly notifies participating search engines (Bing, Yandex,
 * Seznam, Naver) that URLs changed, instead of waiting for the next crawl.
 * A single POST to the shared endpoint fans out to all of them, and Bing is
 * what feeds fresh URLs into Copilot / ChatGPT browsing surfaces.
 *
 * The verification key is PUBLIC by design (it is published at a URL anyone
 * can read; that public file IS the proof we own the host), so it lives in
 * source rather than an env var. It is served as a static file from
 * `apps/web/public/<INDEXNOW_KEY>.txt`.
 *
 * IMPORTANT: the static file's name and contents MUST equal INDEXNOW_KEY. If
 * you rotate the key, rename the public file and update its contents to match.
 */

/** Public, non-secret verification key. Published at `/<key>.txt`. */
export const INDEXNOW_KEY = "5aea8f1ad1335417bd566ed53571c5e2";

const ENDPOINT = "https://api.indexnow.org/indexnow";

export type IndexNowResult = {
  ok: boolean;
  status: number;
  submitted: number;
};

/**
 * Submit a batch of URLs to IndexNow. Defaults to the full canonical
 * marketing list. All URLs must be on {@link MARKETING_ORIGIN}'s host.
 */
export async function submitToIndexNow(
  urls: string[] = MARKETING_URLS,
): Promise<IndexNowResult> {
  const host = new URL(MARKETING_ORIGIN).host;
  const body = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${MARKETING_ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    // Never let a slow/hanging IndexNow endpoint stall the caller.
    signal: AbortSignal.timeout(10_000),
  });

  return { ok: res.ok, status: res.status, submitted: urls.length };
}
