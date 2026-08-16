/**
 * Field-constraint application
 *
 * Constraints are derived from validation-rule interpretation (see
 * services/validation-interpreter.js) and enforced in two places: a
 * post-generation adjustment pass, and the insert retry loop when a record
 * fails FIELD_CUSTOM_VALIDATION_EXCEPTION.
 *
 * Supported constraint shapes (keyed by field API name):
 *   { type: 'fixedValue', value }            — field must equal value
 *   { type: 'picklistSubset', values: [] }   — field must be one of values
 *   { type: 'range', min?, max? }            — numeric bounds
 *   { type: 'notNull' }                      — field must be populated
 *   { type: 'maxLength', value }             — string length cap
 */

/**
 * Enforce constraints on a record IN PLACE.
 * ctx: { fieldsByName?: Map, regenerateField?: (meta, index) => value, index?: number }
 * Returns an array of human-readable notes (empty = nothing needed changing).
 */
function applyConstraints(record, fieldConstraints, ctx = {}) {
  const notes = [];

  for (const [fieldName, constraint] of Object.entries(fieldConstraints || {})) {
    if (!constraint || !constraint.type) continue;
    const meta = ctx.fieldsByName?.get(fieldName);
    // Never write fields Salesforce won't accept
    if (meta && (meta.createable === false || meta.calculated || meta.calculatedFormula || meta.autoNumber)) {
      continue;
    }
    const current = record[fieldName];

    switch (constraint.type) {
      case 'fixedValue': {
        if (current !== constraint.value) {
          record[fieldName] = constraint.value;
          notes.push(`${fieldName}=${JSON.stringify(constraint.value)}`);
        }
        break;
      }

      case 'picklistSubset': {
        const values = Array.isArray(constraint.values) ? constraint.values : [];
        if (!values.length) break;
        if (!values.includes(current)) {
          record[fieldName] = values[(ctx.index || 0) % values.length];
          notes.push(`${fieldName} set from allowed subset`);
        }
        break;
      }

      case 'range': {
        if (typeof current === 'number') {
          let v = current;
          if (constraint.min != null && v < constraint.min) v = constraint.min;
          if (constraint.max != null && v > constraint.max) v = constraint.max;
          if (v !== current) {
            record[fieldName] = v;
            notes.push(`${fieldName} clamped to [${constraint.min ?? '-∞'}, ${constraint.max ?? '∞'}]`);
          }
        } else if ((current === null || current === undefined) && constraint.min != null) {
          record[fieldName] = constraint.min;
          notes.push(`${fieldName} set to range minimum`);
        }
        break;
      }

      case 'notNull': {
        if (current === null || current === undefined || current === '') {
          const v = meta && ctx.regenerateField ? ctx.regenerateField(meta, ctx.index || 0) : undefined;
          if (v !== null && v !== undefined) {
            record[fieldName] = v;
            notes.push(`${fieldName} filled (notNull)`);
          }
        }
        break;
      }

      case 'maxLength': {
        if (typeof current === 'string' && constraint.value > 0 && current.length > constraint.value) {
          record[fieldName] = current.substring(0, constraint.value);
          notes.push(`${fieldName} truncated to ${constraint.value}`);
        }
        break;
      }
    }
  }

  return notes;
}

module.exports = { applyConstraints };
