/**
 * Salesforce Formula Evaluator
 * Evaluates common Salesforce validation rule formulas locally
 */

class FormulaEvaluator {
  constructor() {
    this.functions = {
      // Text functions
      'ISBLANK': this.isBlank.bind(this),
      'ISNOTBLANK': this.isNotBlank.bind(this),
      'LEN': this.len.bind(this),
      'LEFT': this.left.bind(this),
      'RIGHT': this.right.bind(this),
      'MID': this.mid.bind(this),
      'UPPER': this.upper.bind(this),
      'LOWER': this.lower.bind(this),
      'TRIM': this.trim.bind(this),
      'CONTAINS': this.contains.bind(this),
      'BEGINS': this.begins.bind(this),
      'SUBSTITUTE': this.substitute.bind(this),
      'REGEX': this.regex.bind(this),
      
      // Logical functions
      'AND': this.and.bind(this),
      'OR': this.or.bind(this),
      'NOT': this.not.bind(this),
      'IF': this.if.bind(this),
      
      // Math functions
      'ABS': this.abs.bind(this),
      'MAX': this.max.bind(this),
      'MIN': this.min.bind(this),
      'ROUND': this.round.bind(this),
      'FLOOR': this.floor.bind(this),
      'CEILING': this.ceiling.bind(this),
      
      // Date functions
      'TODAY': this.today.bind(this),
      'NOW': this.now.bind(this),
      'DATE': this.date.bind(this),
      'DATETIME': this.datetime.bind(this),
      'YEAR': this.year.bind(this),
      'MONTH': this.month.bind(this),
      'DAY': this.day.bind(this),
      'DATEVALUE': this.dateValue.bind(this),
      
      // Picklist functions
      'ISPICKVAL': this.isPickVal.bind(this),
      'TEXT': this.text.bind(this),
      
      // Reference functions
      'ISNULL': this.isNull.bind(this),
      'ISNOTNULL': this.isNotNull.bind(this),
      
      // Utility functions
      'VALUE': this.value.bind(this)
    };
    
    this.operators = {
      '=': (a, b) => a === b,
      '==': (a, b) => a === b,
      '<>': (a, b) => a !== b,
      '!=': (a, b) => a !== b,
      '<': (a, b) => a < b,
      '<=': (a, b) => a <= b,
      '>': (a, b) => a > b,
      '>=': (a, b) => a >= b,
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
      '&&': (a, b) => a && b,
      '||': (a, b) => a || b
    };
  }

  /**
   * Evaluate a Salesforce formula against record data
   * @param {string} formula - The formula string
   * @param {object} record - Record data with field values
   * @param {object} metadata - Field metadata for type conversion
   * @returns {boolean|string|number} Evaluation result
   */
  evaluate(formula, record = {}, metadata = {}) {
    try {
      // Clean and normalize formula
      let normalized = this.normalizeFormula(formula);
      
      // Replace field references with actual values
      normalized = this.replaceFieldReferences(normalized, record, metadata);
      
      // Evaluate the expression
      return this.evaluateExpression(normalized);
    } catch (error) {
      console.warn('Formula evaluation failed:', error.message, 'Formula:', formula);
      // Return false for validation rules (fail safe)
      return false;
    }
  }

  /**
   * Normalize formula syntax
   */
  normalizeFormula(formula) {
    return formula
      .replace(/\r\n|\r|\n/g, ' ') // Remove line breaks
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Replace field references with values
   */
  replaceFieldReferences(formula, record, metadata) {
    // Match field references (simple field names and relationships), but not those inside quotes
    let result = formula;
    const fieldRegex = /\b([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)\b/g;
    const stringLiterals = [];
    
    // First, extract and replace string literals to avoid replacing field names inside them
    result = result.replace(/"([^"]*)"/g, (match, content) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });
    
    result = result.replace(/'([^']*)'/g, (match, content) => {
      stringLiterals.push(match);
      return `__STRING_${stringLiterals.length - 1}__`;
    });
    
    // Now replace field references
    result = result.replace(fieldRegex, (match, fieldPath) => {
      // Skip function names
      if (this.functions[match.toUpperCase()]) {
        return match;
      }
      
      // Skip operators and literals
      if (this.operators[match] || /^\d/.test(match) || match === 'true' || match === 'false' || match === 'null') {
        return match;
      }
      
      // Skip placeholder strings
      if (match.startsWith('__STRING_')) {
        return match;
      }
      
      // Get field value
      const value = this.getFieldValue(fieldPath, record);
      const fieldType = this.getFieldType(fieldPath, metadata);
      
      return this.formatValueForFormula(value, fieldType);
    });
    
    // Restore string literals
    stringLiterals.forEach((literal, index) => {
      result = result.replace(`__STRING_${index}__`, literal);
    });
    
    return result;
  }

  /**
   * Get field value from record (supports dot notation)
   */
  getFieldValue(fieldPath, record) {
    const parts = fieldPath.split('.');
    let value = record;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  /**
   * Get field type from metadata
   */
  getFieldType(fieldPath, metadata) {
    return metadata[fieldPath]?.type || 'string';
  }

  /**
   * Format value for formula evaluation
   */
  formatValueForFormula(value, type) {
    if (value === null || value === undefined) {
      return 'null';
    }
    
    switch (type) {
      case 'string':
      case 'email':
      case 'phone':
      case 'url':
      case 'textarea':
        return `"${String(value).replace(/"/g, '\\"')}"`;
      case 'boolean':
        return Boolean(value) ? 'true' : 'false';
      case 'date':
        return `DATE(${value})`;
      case 'datetime':
        return `DATETIME(${value})`;
      case 'picklist':
      case 'multipicklist':
        return `"${String(value)}"`;
      default:
        return String(value);
    }
  }

  /**
   * Evaluate processed expression
   */
  evaluateExpression(expression) {
    let result = expression;
    let prevResult = '';
    let iterations = 0;
    const maxIterations = 50;
    
    // Keep evaluating until no more changes or max iterations
    while (result !== prevResult && iterations < maxIterations && typeof result === 'string') {
      prevResult = result;
      
      // Handle function calls first
      const functionResult = this.evaluateFunctions(result);
      
      // If function evaluation returned a non-string, we're done
      if (typeof functionResult !== 'string') {
        result = functionResult;
        break;
      }
      
      result = functionResult;
      
      // Handle operators
      const operatorResult = this.evaluateOperators(result);
      
      // If operator evaluation returned a non-string, we're done
      if (typeof operatorResult !== 'string') {
        result = operatorResult;
        break;
      }
      
      result = operatorResult;
      iterations++;
    }
    
    // Parse final result if it's still a string
    if (typeof result === 'string') {
      return this.parseResult(result);
    }
    
    return result;
  }

  /**
   * Evaluate function calls in expression
   */
  evaluateFunctions(expression) {
    // Match function calls: FUNCTION(args)
    const functionRegex = /\b([A-Z_]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    
    let result = expression;
    let hasMatches = true;
    
    while (hasMatches) {
      hasMatches = false;
      result = result.replace(functionRegex, (match, funcName, argsStr) => {
        hasMatches = true;
        const func = this.functions[funcName];
        if (!func) {
          // Return the original match for unsupported functions
          return match;
        }
        
        const args = this.parseArguments(argsStr);
        const funcResult = func(...args);
        
        // For boolean results, return the actual boolean value as string
        if (typeof funcResult === 'boolean') {
          return String(funcResult);
        } else if (typeof funcResult === 'number') {
          return String(funcResult);
        } else if (typeof funcResult === 'string') {
          return `"${funcResult}"`;
        } else if (funcResult instanceof Date) {
          return `DATE(${funcResult.getTime()})`;
        } else if (funcResult === null || funcResult === undefined) {
          return 'null';
        }
        
        return String(funcResult);
      });
    }
    
    return result;
  }

  /**
   * Parse function arguments
   */
  parseArguments(argsStr) {
    if (!argsStr.trim()) return [];
    
    const args = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
        current += char;
      } else if (inString && char === stringChar) {
        inString = false;
        current += char;
      } else if (!inString && char === '(') {
        depth++;
        current += char;
      } else if (!inString && char === ')') {
        depth--;
        current += char;
      } else if (!inString && char === ',' && depth === 0) {
        args.push(this.parseValue(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(this.parseValue(current.trim()));
    }
    
    return args;
  }

  /**
   * Parse individual value
   */
  parseValue(value) {
    value = value.trim();
    
    // String literals
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Boolean literals
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Null
    if (value === 'null') return null;
    
    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }

  /**
   * Evaluate operators
   */
  evaluateOperators(expression) {
    // Skip if expression is not a string
    if (typeof expression !== 'string') {
      return expression;
    }
    
    // Handle simple expressions first - just operators
    const simpleOperatorRegex = /^("[^"]*"|'[^']*'|\w+|\d+(?:\.\d+)?|true|false|null)\s*(>=|<=|<>|!=|==|=|>|<|\+|-|\*|\/|&&|\|\|)\s*("[^"]*"|'[^']*'|\w+|\d+(?:\.\d+)?|true|false|null)$/;
    
    const simpleMatch = expression.match(simpleOperatorRegex);
    if (simpleMatch) {
      const [, left, op, right] = simpleMatch;
      const leftVal = this.parseValue(left);
      const rightVal = this.parseValue(right);
      const operator = this.operators[op];
      
      if (!operator) {
        throw new Error(`Unknown operator: ${op}`);
      }
      
      return operator(leftVal, rightVal);
    }

    // Handle more complex expressions
    let result = expression;
    const operatorRegex = /("[^"]*"|'[^']*'|\w+|\d+(?:\.\d+)?|true|false|null)\s*(>=|<=|<>|!=|==|=|>|<|\+|-|\*|\/|&&|\|\|)\s*("[^"]*"|'[^']*'|\w+|\d+(?:\.\d+)?|true|false|null)/g;
    
    let hasMatches = true;
    while (hasMatches && typeof result === 'string') {
      const prevResult = result;
      result = result.replace(operatorRegex, (match, left, op, right) => {
        const leftVal = this.parseValue(left);
        const rightVal = this.parseValue(right);
        const operator = this.operators[op];
        
        if (!operator) {
          return match; // Return unchanged if operator not supported
        }
        
        const evalResult = operator(leftVal, rightVal);
        return String(evalResult);
      });
      hasMatches = result !== prevResult;
    }
    
    return result;
  }

  /**
   * Parse final result
   */
  parseResult(result) {
    result = result.trim();
    
    if (result === 'true') return true;
    if (result === 'false') return false;
    if (result === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(result)) return parseFloat(result);
    if (result.startsWith('"') && result.endsWith('"')) return result.slice(1, -1);
    
    return result;
  }

  // Salesforce Function implementations
  
  isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  isNotBlank(value) {
    return !this.isBlank(value);
  }

  len(value) {
    return value === null || value === undefined ? 0 : String(value).length;
  }

  left(text, numChars) {
    return String(text || '').substring(0, numChars);
  }

  right(text, numChars) {
    const str = String(text || '');
    return str.substring(str.length - numChars);
  }

  mid(text, startPos, numChars) {
    return String(text || '').substring(startPos - 1, startPos - 1 + numChars);
  }

  upper(text) {
    return String(text || '').toUpperCase();
  }

  lower(text) {
    return String(text || '').toLowerCase();
  }

  trim(text) {
    return String(text || '').trim();
  }

  contains(text, substring) {
    return String(text || '').includes(String(substring || ''));
  }

  begins(text, prefix) {
    return String(text || '').startsWith(String(prefix || ''));
  }

  substitute(text, oldText, newText) {
    return String(text || '').replace(new RegExp(String(oldText || ''), 'g'), String(newText || ''));
  }

  regex(text, pattern) {
    try {
      return new RegExp(pattern).test(String(text || ''));
    } catch (e) {
      return false;
    }
  }

  and(...args) {
    return args.every(arg => Boolean(arg));
  }

  or(...args) {
    return args.some(arg => Boolean(arg));
  }

  not(value) {
    return !Boolean(value);
  }

  if(condition, trueValue, falseValue) {
    return Boolean(condition) ? trueValue : falseValue;
  }

  abs(number) {
    return Math.abs(Number(number) || 0);
  }

  max(...args) {
    const numbers = args.map(arg => Number(arg) || 0);
    return Math.max(...numbers);
  }

  min(...args) {
    const numbers = args.map(arg => Number(arg) || 0);
    return Math.min(...numbers);
  }

  round(number, places = 0) {
    const factor = Math.pow(10, places);
    return Math.round((Number(number) || 0) * factor) / factor;
  }

  floor(number) {
    return Math.floor(Number(number) || 0);
  }

  ceiling(number) {
    return Math.ceil(Number(number) || 0);
  }

  today() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  now() {
    return new Date();
  }

  date(year, month, day) {
    return new Date(year, month - 1, day);
  }

  datetime(year, month, day, hour, minute, second) {
    return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
  }

  year(date) {
    return new Date(date).getFullYear();
  }

  month(date) {
    return new Date(date).getMonth() + 1;
  }

  day(date) {
    return new Date(date).getDate();
  }

  dateValue(dateString) {
    return new Date(dateString);
  }

  isPickVal(field, value) {
    // For local evaluation, we assume the field equals the value
    return field === value;
  }

  text(value) {
    return String(value || '');
  }

  isNull(value) {
    return value === null || value === undefined;
  }

  isNotNull(value) {
    return value !== null && value !== undefined;
  }

  value(text) {
    const num = Number(text);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Get supported functions list
   */
  getSupportedFunctions() {
    return Object.keys(this.functions);
  }

  /**
   * Check if a formula can be evaluated
   */
  canEvaluate(formula) {
    try {
      // Extract function names from formula
      const functionMatches = formula.match(/\b([A-Z_]+)\s*\(/g);
      if (functionMatches) {
        const usedFunctions = functionMatches.map(match => 
          match.replace(/\s*\($/, '').toUpperCase()
        );
        
        // Check if all functions are supported
        return usedFunctions.every(func => this.functions[func]);
      }
      
      return true; // No functions used, likely just field comparisons
    } catch (error) {
      return false;
    }
  }
}

module.exports = FormulaEvaluator;