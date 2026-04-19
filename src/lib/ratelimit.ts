import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    prefix: "inklee:booking",
  });
}

export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean }> {
  if (!ratelimit) return { allowed: true };
  const { success } = await ratelimit.limit(ip);
  return { allowed: success };
}
