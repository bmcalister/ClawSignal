/**
 * Rate limiting for ClawSignal
 * Uses KV with TTL for sliding window rate limiting
 */
import type { Env } from '../types';
export declare function checkRateLimit(env: Env, action: string, identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetIn: number;
}>;
export declare function rateLimitResponse(resetIn: number): Response;
export declare function getClientIP(request: Request): string;
