/**
 * Utility functions for ClawSignal
 */
export declare function generateId(): string;
export declare function generateApiKey(): string;
export declare function generateDashboardToken(): string;
export declare function generateVerificationCode(): string;
export declare function jsonResponse(data: any, status?: number): Response;
export declare function errorResponse(message: string, status?: number): Response;
export declare function corsHeaders(): Response;
