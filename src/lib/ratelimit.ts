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

let waitlistRatelimit: Ratelimit | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  waitlistRatelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(3, "1 h"),
    prefix: "inklee:waitlist",
  });
}

export async function checkWaitlistRateLimit(
  ip: string,
): Promise<{ allowed: boolean }> {
  if (!waitlistRatelimit) return { allowed: true };
  const { success } = await waitlistRatelimit.limit(ip);
  return { allowed: success };
}
