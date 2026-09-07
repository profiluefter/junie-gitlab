import {describe, test} from "node:test";
import assert from "node:assert";
import {withRetry} from "../../src/utils/retry.js";

/** Builds an error shaped like a @gitbeaker `GitbeakerRequestError`. */
function gitbeakerError(description: string): Error {
    const e = new Error(description);
    (e as any).cause = {description};
    return e;
}

/** Builds a transient undici network error (TypeError with UND_ERR cause). */
function networkError(): TypeError {
    const e = new TypeError("fetch failed");
    (e as any).cause = {code: "UND_ERR_SOCKET"};
    return e;
}

describe("withRetry", () => {
    test("given fn succeeds on first try then returns its value without retrying", async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            return "ok";
        }, "success");

        assert.strictEqual(result, "ok");
        assert.strictEqual(calls, 1);
    });

    test("given 409 Resource lock then retries and eventually succeeds", async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            if (calls === 1) {
                throw gitbeakerError("409 Conflict: Resource lock");
            }
            return "recovered";
        }, "409 then success");

        assert.strictEqual(result, "recovered");
        assert.strictEqual(calls, 2);
    });

    test("given persistent 409 Resource lock then retries all attempts then throws", async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw gitbeakerError("409 Conflict: Resource lock");
            }, "persistent 409"),
            /Resource lock/
        );
        // initial attempt + 2 retries (delays array has length 2)
        assert.strictEqual(calls, 3);
    });

    test("given transient network error then retries and eventually succeeds", async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            if (calls === 1) {
                throw networkError();
            }
            return "recovered";
        }, "network then success");

        assert.strictEqual(result, "recovered");
        assert.strictEqual(calls, 2);
    });

    test("given a non-retryable error then throws immediately without retrying", async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(async () => {
                calls++;
                throw gitbeakerError("404 Not Found");
            }, "non-retryable"),
            /404 Not Found/
        );
        assert.strictEqual(calls, 1);
    });
});
