/**
 * Utility functions for ClawSignal
 */
export function generateId() {
    return crypto.randomUUID();
}
export function generateApiKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return 'clawsig_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function generateDashboardToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return 'dash_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function generateVerificationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `clawsig-${code}`;
}
export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
export function errorResponse(message, status = 400) {
    return jsonResponse({ success: false, error: message }, status);
}
export function corsHeaders() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
