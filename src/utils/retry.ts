import {logger} from "./logging.js";

function isNetworkError(e: unknown): boolean {
    return e instanceof TypeError && (e as any).cause?.code?.startsWith('UND_ERR');
}

function getErrorDescription(e: unknown): string {
    if (e && typeof e === 'object') {
        const description = (e as any).cause?.description;
        if (typeof description === 'string') {
            return description;
        }
        const message = (e as any).message;
        if (typeof message === 'string') {
            return message;
        }
    }
    return String(e);
}

function isRetryableConflict(e: unknown): boolean {
    const description = getErrorDescription(e).toLowerCase();
    return description.includes('409') && description.includes('resource lock');
}

export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    const delays = [2000, 5000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
            return await fn();
        } catch (e) {
            if (attempt < delays.length && (isNetworkError(e) || isRetryableConflict(e))) {
                const reason = isNetworkError(e) ? 'Network error' : 'Resource lock (409)';
                logger.warn(`${reason} on ${label}, retrying in ${delays[attempt]}ms...`);
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            } else {
                throw e;
            }
        }
    }
    throw new Error('unreachable');
}
