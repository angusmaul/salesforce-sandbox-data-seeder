/**
 * Error-driven insert retry
 *
 * Wraps a batch insert with up to MAX_ATTEMPTS passes. After each pass, failed
 * records are remediated per Salesforce error code (truncate, drop field,
 * re-pick picklist value, clamp number, fill missing required, uniquify
 * duplicates, null bad lookups) and resubmitted. Records that can't be
 * remediated fail terminally with their original errors.
 *
 * Results stay aligned to the ORIGINAL record indices, and each entry keeps the
 * shape downstream code expects ({ success, id?, errors? }) plus `attempts` and
 * `retryHistory` for the load logs.
 */

const { FieldDataGenerator } = require('./salesforce-field-types');
const { applyConstraints } = require('./field-constraints');

const MAX_ATTEMPTS = 3; // 1 initial + 2 remediated passes

/** Append a short random suffix, respecting field length and email shape. */
function uniquifyValue(value, fieldMeta) {
  const suffix = `-${Math.random().toString(36).slice(2, 7)}`;
  const str = String(value);
  if (str.includes('@')) {
    const [local, domain] = str.split('@');
    return `${local.substring(0, Math.max(1, 60 - suffix.length))}${suffix}@${domain}`;
  }
  const maxLen = fieldMeta?.length || 255;
  return `${str.substring(0, Math.max(1, maxLen - suffix.length))}${suffix}`;
}

/**
 * Produce an adjusted copy of a failed record, or null if it should be dropped.
 * ctx: { fieldsByName: Map, regenerateField(meta, attempt) -> value }
 */
function remediateRecord(objectName, record, errors, ctx, attempt) {
  const adjusted = { ...record };
  const notes = [];

  for (const error of errors || []) {
    const code = error.statusCode || '';
    // Fields the error names that are actually on this record
    const errFields = (error.fields || []).filter(f => f in adjusted);

    switch (code) {
      case 'STRING_TOO_LONG': {
        if (!errFields.length) return null;
        for (const f of errFields) {
          const meta = ctx.fieldsByName.get(f);
          if (meta?.length && typeof adjusted[f] === 'string') {
            adjusted[f] = adjusted[f].substring(0, meta.length);
            notes.push(`truncated ${f}`);
          } else {
            delete adjusted[f];
            notes.push(`dropped ${f}`);
          }
        }
        break;
      }

      case 'FIELD_INTEGRITY_EXCEPTION': {
        if (errFields.length) {
          errFields.forEach(f => { delete adjusted[f]; notes.push(`dropped ${f}`); });
        } else {
          // No field named — most integrity errors are address-related
          let droppedAny = false;
          for (const k of Object.keys(adjusted)) {
            if (/(State|Country)(Code)?$|GeocodeAccuracy$|Latitude$|Longitude$/.test(k)) {
              delete adjusted[k];
              notes.push(`dropped ${k}`);
              droppedAny = true;
            }
          }
          if (!droppedAny) return null;
        }
        break;
      }

      case 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST': {
        if (!errFields.length) return null;
        for (const f of errFields) {
          const meta = ctx.fieldsByName.get(f);
          const actives = (meta?.picklistValues || []).filter(pv => pv.active);
          if (actives.length) {
            adjusted[f] = actives[attempt % actives.length].value;
            notes.push(`re-picked ${f}`);
          } else {
            delete adjusted[f];
            notes.push(`dropped ${f}`);
          }
        }
        break;
      }

      case 'NUMBER_OUTSIDE_VALID_RANGE': {
        if (!errFields.length) return null;
        for (const f of errFields) {
          const meta = ctx.fieldsByName.get(f);
          if (attempt === 1 && meta && typeof adjusted[f] === 'number') {
            adjusted[f] = FieldDataGenerator.clampToFieldPrecision(adjusted[f], meta);
            notes.push(`clamped ${f}`);
          } else {
            delete adjusted[f];
            notes.push(`dropped ${f}`);
          }
        }
        break;
      }

      case 'REQUIRED_FIELD_MISSING': {
        const missing = error.fields || [];
        if (!missing.length) return null;
        for (const f of missing) {
          const meta = ctx.fieldsByName.get(f);
          // A required lookup we couldn't fill the first time won't fill now
          if (!meta || meta.type === 'reference') return null;
          const value = ctx.regenerateField(meta, attempt);
          if (value === null || value === undefined) return null;
          adjusted[f] = value;
          notes.push(`filled ${f}`);
        }
        break;
      }

      case 'DUPLICATE_VALUE':
      case 'DUPLICATE_EXTERNAL_ID':
      case 'DUPLICATES_DETECTED': {
        // Duplicate rules often name no field — vary the identity-ish ones
        const targets = errFields.length
          ? errFields
          : Object.keys(adjusted).filter(k => /^(Name|LastName|FirstName|Email|Company)$/.test(k));
        const stringTargets = targets.filter(f => typeof adjusted[f] === 'string');
        if (!stringTargets.length) return null;
        for (const f of stringTargets) {
          adjusted[f] = uniquifyValue(adjusted[f], ctx.fieldsByName.get(f));
          notes.push(`uniquified ${f}`);
        }
        break;
      }

      case 'INVALID_CROSS_REFERENCE_KEY':
      case 'INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY':
      case 'MALFORMED_ID': {
        if (!errFields.length) return null;
        for (const f of errFields) {
          const meta = ctx.fieldsByName.get(f);
          if (meta?.required && !meta?.defaultedOnCreate) return null; // can't drop a required lookup
          delete adjusted[f];
          notes.push(`dropped lookup ${f}`);
        }
        break;
      }

      // Transient — one unchanged resubmit is worth a shot
      case 'UNABLE_TO_LOCK_ROW':
      case 'SERVER_UNAVAILABLE':
      case 'REQUEST_RUNNING_TOO_LONG': {
        if (attempt >= 2) return null;
        notes.push('resubmitted unchanged (transient)');
        break;
      }

      // With interpreted rule constraints (ctx.validationConstraints) we can
      // adjust the record to satisfy the rule; without them it's terminal.
      case 'FIELD_CUSTOM_VALIDATION_EXCEPTION': {
        const constraints = ctx.validationConstraints;
        if (!constraints || Object.keys(constraints).length === 0) return null;
        const applied = applyConstraints(adjusted, constraints, {
          fieldsByName: ctx.fieldsByName,
          regenerateField: ctx.regenerateField ? (meta) => ctx.regenerateField(meta, attempt) : undefined,
          index: attempt
        });
        if (!applied.length) return null; // constraints already satisfied → rule not expressible, give up
        notes.push(`applied validation constraints (${applied.join('; ')})`);
        break;
      }

      default:
        return null;
    }
  }

  if (!notes.length) return null;
  if (Object.keys(adjusted).length === 0) return null;
  return { record: adjusted, note: notes.join(', ') };
}

/**
 * Insert with error-driven retries.
 *
 * @param {Function} insertFn - async (records[]) => salesforce save results[]
 * @param {string} objectName
 * @param {Array<Object>} records - generated records (original order)
 * @param {Object} ctx - { fieldsByName, regenerateField, onLog? }
 * @returns {{ resultsArray, retrySummary, learnedDropFields }}
 */
async function insertWithRetry(insertFn, objectName, records, ctx) {
  const finalResults = new Array(records.length);
  const retrySummary = { attempts: 0, recoveredRecords: 0, remediations: {} };
  let pending = records.map((record, originalIndex) => ({ record, originalIndex, history: [] }));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
    retrySummary.attempts = attempt;

    let results;
    try {
      results = await insertFn(pending.map(p => p.record));
    } catch (bulkError) {
      for (const p of pending) {
        finalResults[p.originalIndex] = {
          success: false,
          errors: [{ statusCode: 'BULK_ERROR', message: bulkError.message }],
          attempts: attempt,
          retryHistory: p.history.length ? p.history : undefined
        };
      }
      pending = [];
      break;
    }

    const resultsArray = Array.isArray(results) ? results : [results];
    const nextPending = [];

    resultsArray.forEach((result, i) => {
      const p = pending[i];
      if (result.success) {
        if (attempt > 1) retrySummary.recoveredRecords++;
        finalResults[p.originalIndex] = {
          success: true,
          id: result.id,
          attempts: attempt,
          retryHistory: p.history.length ? p.history : undefined
        };
        return;
      }

      const errors = result.errors || [{ statusCode: 'UNKNOWN', message: 'Unknown error' }];

      // Tally remediation stats regardless of outcome
      for (const e of errors) {
        const code = e.statusCode || 'UNKNOWN';
        if (!retrySummary.remediations[code]) retrySummary.remediations[code] = { count: 0, fields: [] };
        retrySummary.remediations[code].count++;
        for (const f of (e.fields || [])) {
          if (!retrySummary.remediations[code].fields.includes(f)) retrySummary.remediations[code].fields.push(f);
        }
      }

      if (attempt < MAX_ATTEMPTS) {
        const adjusted = remediateRecord(objectName, p.record, errors, ctx, attempt);
        if (adjusted) {
          p.history.push({ attempt, errors: errors.map(e => e.statusCode), action: adjusted.note });
          p.record = adjusted.record;
          nextPending.push(p);
          return;
        }
      }

      finalResults[p.originalIndex] = {
        success: false,
        errors,
        attempts: attempt,
        retryHistory: p.history.length ? p.history : undefined
      };
    });

    pending = nextPending;
    if (pending.length > 0 && ctx.onLog) {
      ctx.onLog(`Retry pass ${attempt} for ${objectName}: ${pending.length} record(s) adjusted and resubmitted`);
    }
  }

  // Learned blocklist: fields whose removal fixed most of the recovered records
  const dropFixCounts = {};
  for (const r of finalResults) {
    if (!r?.success || !r.retryHistory) continue;
    const droppedFields = new Set();
    for (const h of r.retryHistory) {
      for (const m of h.action.matchAll(/dropped (?:lookup )?(\S+)/g)) droppedFields.add(m[1]);
    }
    for (const f of droppedFields) dropFixCounts[f] = (dropFixCounts[f] || 0) + 1;
  }
  const learnedDropFields = Object.entries(dropFixCounts)
    .filter(([, count]) => count >= 3 && count >= 0.8 * retrySummary.recoveredRecords)
    .map(([f]) => f);

  return { resultsArray: finalResults, retrySummary, learnedDropFields };
}

module.exports = { insertWithRetry, remediateRecord, uniquifyValue, MAX_ATTEMPTS };
