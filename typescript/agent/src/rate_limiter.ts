/**
 * Simple rate limiter for API calls
 * Gemini free tier: 15 RPM (requests per minute), 1500 RPD (requests per day)
 */
export class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly maxRequestsPerDay: number;

  constructor(
    maxRequestsPerMinute: number = 15,
    maxRequestsPerDay: number = 1500
  ) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.maxRequestsPerDay = maxRequestsPerDay;
  }

  /**
   * Wait if necessary to respect rate limits, then record the request
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Clean up old request times
    this.requestTimes = this.requestTimes.filter(time => time > oneDayAgo);

    // Check daily limit
    if (this.requestTimes.length >= this.maxRequestsPerDay) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + 24 * 60 * 60 * 1000 - now;
      console.log(`⏳ Daily rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(waitTime);
    }

    // Check per-minute limit
    const recentRequests = this.requestTimes.filter(time => time > oneMinuteAgo);
    if (recentRequests.length >= this.maxRequestsPerMinute) {
      const oldestRecentRequest = recentRequests[0];
      const waitTime = oldestRecentRequest + 60 * 1000 - now;
      console.log(`⏳ Rate limit: Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this.sleep(waitTime);
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { requestsLastMinute: number; requestsToday: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    return {
      requestsLastMinute: this.requestTimes.filter(t => t > oneMinuteAgo).length,
      requestsToday: this.requestTimes.filter(t => t > oneDayAgo).length,
    };
  }

  /**
   * Get rate limit configuration
   */
  getConfig(): { maxRequestsPerMinute: number; maxRequestsPerDay: number } {
    return {
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      maxRequestsPerDay: this.maxRequestsPerDay,
    };
  }
}

export function rateLimitedModel<T>(model: T, rateLimiter: RateLimiter): T {
  // @ts-ignore
  model.generateText = async (...args: any[]) => {
    await rateLimiter.acquire();
    // @ts-ignore
    return model.generateTextOriginal(...args);
  };
  // @ts-ignore
  model.generateTextOriginal = model.generateText;
  // @ts-ignore
  model.rateLimiter = rateLimiter;
  return model;
}