/**
 * Validation Rule Parser
 * 
 * Parses Salesforce validation rule formulas to extract:
 * - Field dependencies
 * - Constraint patterns
 * - Complexity analysis
 * - Risk assessment
 */

/**
 * Parse a validation rule formula to extract field references and dependencies
 * @param {string} formula - The validation rule formula
 * @param {string} objectName - The object this validation rule applies to
 * @returns {Object} Parsed validation rule information
 */
function parseValidationRuleFormula(formula, objectName) {
    if (!formula || typeof formula !== 'string') {
        return {
            fields: [],
            dependencies: [],
            complexity: 'simple',
            riskLevel: 'low',
            operators: [],
            patterns: []
        };
    }

    const result = {
        fields: new Set(),
        dependencies: [],
        complexity: 'simple',
        riskLevel: 'low',
        operators: [],
        patterns: []
    };

    try {
        // Extract field references (field names, including custom fields)
        const fieldPattern = /\b([A-Za-z][A-Za-z0-9_]*(__c|__r)?)\b/g;
        const fields = [...formula.matchAll(fieldPattern)]
            .map(match => match[1])
            .filter(field => !isFormulaFunction(field) && !isConstant(field));
        
        result.fields = new Set(fields);

        // Extract operators and functions
        result.operators = extractOperators(formula);
        
        // Identify common patterns
        result.patterns = identifyPatterns(formula);
        
        // Extract field dependencies
        result.dependencies = extractFieldDependencies(formula, Array.from(result.fields));
        
        // Calculate complexity
        result.complexity = calculateComplexity(formula, result.operators, result.patterns);
        
        // Assess risk level
        result.riskLevel = assessRiskLevel(formula, result.complexity, result.patterns);

    } catch (error) {
        console.warn(`Warning: Could not parse validation rule formula: ${error.message}`);
        result.complexity = 'complex'; // Mark as complex if we can't parse it
        result.riskLevel = 'medium';
    }
    
    // Additional check for malformed formulas
    if (formula && (formula.includes('(((') || formula.match(/\([^)]*$/))) {
        result.complexity = 'complex';
        result.riskLevel = 'medium';
    }

    return {
        ...result,
        fields: Array.from(result.fields)
    };
}

/**
 * Check if a token is a Salesforce formula function
 */
function isFormulaFunction(token) {
    const functions = [
        'ABS', 'ADDMONTHS', 'AND', 'BEGINS', 'BLANKVALUE', 'CASE', 'CEILING',
        'CONTAINS', 'DATE', 'DATEVALUE', 'DATETIME', 'DATETIMEVALUE', 'DAY',
        'EXP', 'FIND', 'FLOOR', 'IF', 'INCLUDE', 'ISBLANK', 'ISNULL', 'ISNUMBER',
        'LEFT', 'LEN', 'LN', 'LOG', 'LOWER', 'LPAD', 'MAX', 'MID', 'MIN', 'MOD',
        'MONTH', 'NOT', 'NOW', 'OR', 'POWER', 'RIGHT', 'ROUND', 'RPAD', 'SQRT',
        'SUBSTITUTE', 'TEXT', 'TODAY', 'TRIM', 'UPPER', 'VALUE', 'WEEKDAY', 'YEAR',
        'ISPICKVAL', 'PRIORVALUE', 'REGEX', 'TRUE', 'FALSE'
    ];
    return functions.includes(token.toUpperCase());
}

/**
 * Check if a token is a constant value
 */
function isConstant(token) {
    // Numbers, quoted strings, true/false, null
    return /^(\d+\.?\d*|"[^"]*"|'[^']*'|true|false|null)$/i.test(token);
}

/**
 * Extract operators from formula
 */
function extractOperators(formula) {
    const operators = [];
    const operatorPatterns = [
        /&&|\|\||AND|OR|NOT/gi, // Logical operators
        /[<>=!]+/g, // Comparison operators
        /[+\-*/]/g, // Arithmetic operators
    ];

    operatorPatterns.forEach(pattern => {
        const matches = [...formula.matchAll(pattern)];
        operators.push(...matches.map(match => match[0].toUpperCase()));
    });

    return [...new Set(operators)];
}

/**
 * Identify common validation patterns
 */
function identifyPatterns(formula) {
    const patterns = [];
    
    // Required field patterns
    if (/ISBLANK\s*\(/i.test(formula) || /ISNULL\s*\(/i.test(formula)) {
        patterns.push('REQUIRED_FIELD_CHECK');
    }
    
    // Conditional requirements
    if (/IF\s*\(/i.test(formula) && (/ISBLANK|ISNULL/i.test(formula))) {
        patterns.push('CONDITIONAL_REQUIREMENT');
    }
    
    // Date validations
    if (/DATE\s*\(|TODAY\s*\(|NOW\s*\(/i.test(formula)) {
        patterns.push('DATE_VALIDATION');
    }
    
    // Picklist validations
    if (/ISPICKVAL\s*\(/i.test(formula)) {
        patterns.push('PICKLIST_VALIDATION');
    }
    
    // Range validations
    if (/[<>]=?/.test(formula) && /\d+/.test(formula)) {
        patterns.push('RANGE_VALIDATION');
    }
    
    // String format validations
    if (/REGEX\s*\(|CONTAINS\s*\(|BEGINS\s*\(/i.test(formula)) {
        patterns.push('FORMAT_VALIDATION');
    }
    
    // Cross-object validations (contains dots for field references)
    if (/\w+\.\w+/.test(formula)) {
        patterns.push('CROSS_OBJECT_VALIDATION');
    }

    return patterns;
}

/**
 * Extract field dependencies from formula
 */
function extractFieldDependencies(formula, fields) {
    const dependencies = [];
    
    // Look for conditional patterns like IF(Field1__c = 'value', ISBLANK(Field2__c), false)
    const conditionalPattern = /IF\s*\(\s*([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)\s*([<>=!]+)\s*([^,]+),\s*(?:ISBLANK|ISNULL)\s*\(\s*([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)\s*\)/gi;
    
    let match;
    while ((match = conditionalPattern.exec(formula)) !== null) {
        const [, sourceField, operator, value, targetField] = match;
        
        if (fields.includes(sourceField) && fields.includes(targetField)) {
            dependencies.push({
                sourceField: sourceField,
                targetField: targetField,
                type: 'required_if',
                condition: `${sourceField} ${operator} ${value.trim()}`,
                operator: operator,
                value: value.trim()
            });
        }
    }
    
    // Look for AND/OR dependencies
    const logicalPattern = /\(([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)[^)]*\)\s*(AND|OR)\s*\(([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)/gi;
    
    while ((match = logicalPattern.exec(formula)) !== null) {
        const [, field1, operator, field2] = match;
        
        if (fields.includes(field1) && fields.includes(field2)) {
            dependencies.push({
                sourceField: field1,
                targetField: field2,
                type: 'conditional',
                condition: operator,
                operator: operator
            });
        }
    }

    return dependencies;
}

/**
 * Calculate complexity based on formula characteristics
 */
function calculateComplexity(formula, operators, patterns) {
    let score = 0;
    
    // Base complexity from length
    if (formula.length > 200) score += 2;
    else if (formula.length > 100) score += 1;
    
    // Complexity from operators
    if (operators.includes('AND') || operators.includes('OR')) score += 1;
    if (operators.includes('NOT')) score += 1;
    if (operators.filter(op => ['<', '>', '<=', '>=', '!=', '='].includes(op)).length > 2) score += 1;
    
    // Complexity from patterns
    if (patterns.includes('CROSS_OBJECT_VALIDATION')) score += 2;
    if (patterns.includes('CONDITIONAL_REQUIREMENT')) score += 1;
    if (patterns.includes('DATE_VALIDATION')) score += 1;
    
    // Complexity from nested functions
    const nestedFunctions = (formula.match(/\(/g) || []).length;
    if (nestedFunctions > 5) score += 2;
    else if (nestedFunctions > 3) score += 1;
    
    // Additional complexity from IF statements
    if (/IF\s*\(/i.test(formula)) score += 1;
    
    if (score >= 4) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
}

/**
 * Assess risk level based on formula characteristics
 */
function assessRiskLevel(formula, complexity, patterns) {
    let risk = 'low';
    
    // High risk patterns
    if (patterns.includes('CROSS_OBJECT_VALIDATION') || 
        patterns.includes('DATE_VALIDATION') ||
        formula.includes('PRIORVALUE')) {
        risk = 'high';
    }
    // Medium risk patterns
    else if (complexity === 'complex' || 
             patterns.includes('CONDITIONAL_REQUIREMENT') ||
             patterns.length > 3) {
        risk = 'medium';
    }
    
    return risk;
}

/**
 * Parse multiple validation rules for an object
 * @param {Array} validationRules - Array of validation rule metadata
 * @param {string} objectName - The object name
 * @returns {Object} Consolidated analysis
 */
function parseObjectValidationRules(validationRules, objectName) {
    if (!validationRules || !Array.isArray(validationRules)) {
        return {
            totalRules: 0,
            activeRules: 0,
            allFields: [],
            allDependencies: [],
            overallComplexity: 'simple',
            overallRisk: 'low',
            patterns: []
        };
    }

    const allFields = new Set();
    const allDependencies = [];
    const allPatterns = new Set();
    let complexityScore = 0;
    let riskScore = 0;

    const parsedRules = validationRules.map(rule => {
        const parsed = parseValidationRuleFormula(rule.errorConditionFormula, objectName);
        
        // Aggregate results
        parsed.fields.forEach(field => allFields.add(field));
        allDependencies.push(...parsed.dependencies);
        parsed.patterns.forEach(pattern => allPatterns.add(pattern));
        
        // Calculate scores
        if (parsed.complexity === 'complex') complexityScore += 3;
        else if (parsed.complexity === 'moderate') complexityScore += 2;
        else complexityScore += 1;
        
        if (parsed.riskLevel === 'high') riskScore += 3;
        else if (parsed.riskLevel === 'medium') riskScore += 2;
        else riskScore += 1;
        
        return {
            ...rule,
            ...parsed
        };
    });

    const activeRules = validationRules.filter(rule => rule.active).length;
    const avgComplexity = complexityScore / validationRules.length;
    const avgRisk = riskScore / validationRules.length;

    return {
        totalRules: validationRules.length,
        activeRules,
        allFields: Array.from(allFields),
        allDependencies,
        overallComplexity: avgComplexity >= 2.5 ? 'complex' : avgComplexity >= 1.5 ? 'moderate' : 'simple',
        overallRisk: avgRisk >= 2.5 ? 'high' : avgRisk >= 1.5 ? 'medium' : 'low',
        patterns: Array.from(allPatterns),
        parsedRules
    };
}

module.exports = {
    parseValidationRuleFormula,
    parseObjectValidationRules,
    extractOperators,
    identifyPatterns,
    calculateComplexity,
    assessRiskLevel
};