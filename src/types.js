// Shared JSDoc shapes for the scan/check path. Imported as types only.
/**
 * @typedef {object} TraceMessage
 * @property {string} role
 * @property {string} content
 */

/**
 * @typedef {object} Trace
 * @property {string} id
 * @property {TraceMessage[]} messages
 * @property {string} [source]
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {object} FailureModeChecker
 * @property {'rule'|'judge'} type
 * @property {string} [pattern]
 * @property {string} [flags]
 * @property {string} [role]
 * @property {string} [model]
 */

/**
 * @typedef {object} FailureMode
 * @property {string} id
 * @property {string} name
 * @property {'proposed'|'calibrating'|'watching'|'retired'} [status]
 * @property {string} [description]
 * @property {string} [judgePrompt]
 * @property {{trace: string, note?: string}[]} [examples]
 * @property {FailureModeChecker} [checker]
 * @property {object} [calibration]
 * @property {string} [file]
 */

/**
 * A checker outcome. Fail-closed: refusal, parse, and network errors use
 * `hit: null` plus `error`. A valid negative is `hit: false` with no error.
 *
 * @typedef {object} CheckResult
 * @property {boolean|null} hit
 * @property {number} [line]
 * @property {string} [quote]
 * @property {string} [reason]
 * @property {string} [error]
 */

/**
 * @typedef {object} ScanHit
 * @property {string} trace
 * @property {number} [line]
 * @property {string} [quote]
 * @property {string} [reason]
 */

/**
 * @typedef {object} ScanFmResult
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {ScanHit[]} hits
 * @property {number} errors
 * @property {number|null} previousHits
 */

/**
 * @typedef {object} ScanSummary
 * @property {string} at
 * @property {number} traces
 * @property {ScanFmResult[]} results
 * @property {string[]} skipped
 * @property {{calls: number, usd: number}} usage
 * @property {number} [suggested]
 * @property {0|1|2} exitCode
 * @property {string} [empty]
 */

export {};
