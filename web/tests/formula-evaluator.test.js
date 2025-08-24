const FormulaEvaluator = require('../server/lib/formula-evaluator.js');

describe('FormulaEvaluator', () => {
  let evaluator;

  beforeEach(() => {
    evaluator = new FormulaEvaluator();
  });

  describe('Basic Formula Functions', () => {
    describe('ISBLANK and ISNOTBLANK', () => {
      test('should correctly evaluate ISBLANK with null values', () => {
        const formula = 'ISBLANK(Name)';
        const record = { Name: null };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate ISBLANK with empty strings', () => {
        const formula = 'ISBLANK(Name)';
        const record = { Name: '' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate ISBLANK with whitespace strings', () => {
        const formula = 'ISBLANK(Name)';
        const record = { Name: '   ' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate ISBLANK with non-empty values', () => {
        const formula = 'ISBLANK(Name)';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(false);
      });

      test('should correctly evaluate ISNOTBLANK', () => {
        const formula = 'ISNOTBLANK(Name)';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });
    });

    describe('Text Functions', () => {
      test('should correctly evaluate LEN function', () => {
        const formula = 'LEN(Name) > 5';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate LEFT function', () => {
        const formula = 'LEFT(Name, 4) = "Test"';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate RIGHT function', () => {
        const formula = 'RIGHT(Name, 7) = "Company"';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate UPPER function', () => {
        const formula = 'UPPER(Name) = "TEST COMPANY"';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate LOWER function', () => {
        const formula = 'LOWER(Name) = "test company"';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate CONTAINS function', () => {
        const formula = 'CONTAINS(Name, "Test")';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate BEGINS function', () => {
        const formula = 'BEGINS(Name, "Test")';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });
    });

    describe('Logical Functions', () => {
      test('should correctly evaluate AND function', () => {
        const formula = 'AND(ISNOTBLANK(Name), LEN(Name) > 5)';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate OR function', () => {
        const formula = 'OR(ISBLANK(Name), LEN(Name) > 5)';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate NOT function', () => {
        const formula = 'NOT(ISBLANK(Name))';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate IF function', () => {
        const formula = 'IF(LEN(Name) > 5, "Long", "Short")';
        const record = { Name: 'Test Company' };
        expect(evaluator.evaluate(formula, record)).toBe('Long');
      });
    });

    describe('Math Functions', () => {
      test('should correctly evaluate ABS function', () => {
        const formula = 'ABS(Amount) > 100';
        const record = { Amount: -150 };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate MAX function', () => {
        const formula = 'MAX(Amount, 100) = 150';
        const record = { Amount: 150 };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate MIN function', () => {
        const formula = 'MIN(Amount, 100) = 100';
        const record = { Amount: 150 };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });

      test('should correctly evaluate ROUND function', () => {
        const formula = 'ROUND(Amount, 2) = 123.46';
        const record = { Amount: 123.456 };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });
    });

    describe('Date Functions', () => {
      test('should correctly evaluate TODAY function', () => {
        const formula = 'TODAY()';
        const result = evaluator.evaluate(formula, {});
        expect(result).toBeInstanceOf(Date);
      });

      test('should correctly evaluate NOW function', () => {
        const formula = 'NOW()';
        const result = evaluator.evaluate(formula, {});
        expect(result).toBeInstanceOf(Date);
      });

      test('should correctly evaluate YEAR function', () => {
        const formula = 'YEAR(CreatedDate) = 2024';
        const record = { CreatedDate: new Date('2024-03-15') };
        expect(evaluator.evaluate(formula, record)).toBe(true);
      });
    });
  });

  describe('Complex Validation Rules', () => {
    test('should handle complex Account validation rule', () => {
      const formula = 'AND(ISNOTBLANK(Name), OR(ISBLANK(Website), BEGINS(Website, "http")))';
      const record = { 
        Name: 'Test Company', 
        Website: 'https://example.com' 
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle Contact email validation', () => {
      const formula = 'OR(ISBLANK(Email), CONTAINS(Email, "@"))';
      const record = { Email: 'test@example.com' };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle Opportunity stage validation', () => {
      const formula = 'AND(ISPICKVAL(StageName, "Closed Won"), Amount > 0)';
      const record = { 
        StageName: 'Closed Won', 
        Amount: 1000 
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle date range validation', () => {
      const formula = 'CloseDate >= TODAY()';
      const record = { 
        CloseDate: new Date(Date.now() + 86400000) // Tomorrow
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle nested field references', () => {
      const formula = 'ISNOTBLANK(Account.Name)';
      const record = { 
        Account: { Name: 'Parent Company' }
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle unknown functions gracefully', () => {
      const formula = 'UNKNOWNFUNCTION(Name)';
      const record = { Name: 'Test' };
      expect(() => evaluator.evaluate(formula, record)).not.toThrow();
      // Should return false for validation rules when failing
      expect(evaluator.evaluate(formula, record)).toBe(false);
    });

    test('should handle missing fields gracefully', () => {
      const formula = 'ISNOTBLANK(MissingField)';
      const record = { Name: 'Test' };
      expect(evaluator.evaluate(formula, record)).toBe(false);
    });

    test('should handle malformed formulas', () => {
      const formula = 'ISNOTBLANK(';
      const record = { Name: 'Test' };
      expect(() => evaluator.evaluate(formula, record)).not.toThrow();
      expect(evaluator.evaluate(formula, record)).toBe(false);
    });
  });

  describe('Field Type Handling', () => {
    test('should handle different field types correctly', () => {
      const record = {
        StringField: 'Test',
        NumberField: 123,
        BooleanField: true,
        DateField: new Date('2024-03-15'),
        NullField: null
      };

      const metadata = {
        StringField: { type: 'string' },
        NumberField: { type: 'number' },
        BooleanField: { type: 'boolean' },
        DateField: { type: 'date' },
        NullField: { type: 'string' }
      };

      expect(evaluator.evaluate('ISNOTBLANK(StringField)', record, metadata)).toBe(true);
      expect(evaluator.evaluate('NumberField > 100', record, metadata)).toBe(true);
      expect(evaluator.evaluate('BooleanField = true', record, metadata)).toBe(true);
      expect(evaluator.evaluate('ISBLANK(NullField)', record, metadata)).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should handle large formulas efficiently', () => {
      const formula = 'AND(' + 'ISNOTBLANK(Name), '.repeat(100) + 'true' + ')'.repeat(100);
      const record = { Name: 'Test' };
      
      const start = Date.now();
      const result = evaluator.evaluate(formula, record);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      expect(result).toBe(true);
    });
  });

  describe('Function Support Detection', () => {
    test('should correctly identify supported formulas', () => {
      expect(evaluator.canEvaluate('ISBLANK(Name)')).toBe(true);
      expect(evaluator.canEvaluate('AND(ISNOTBLANK(Name), LEN(Name) > 5)')).toBe(true);
      expect(evaluator.canEvaluate('VLOOKUP(Name, "Table", 1, FALSE)')).toBe(false);
      expect(evaluator.canEvaluate('PRIORVALUE(Amount)')).toBe(false);
    });

    test('should return list of supported functions', () => {
      const supportedFunctions = evaluator.getSupportedFunctions();
      expect(supportedFunctions).toContain('ISBLANK');
      expect(supportedFunctions).toContain('AND');
      expect(supportedFunctions).toContain('LEN');
      expect(supportedFunctions).toContain('TODAY');
    });
  });

  describe('Real-world Salesforce Validation Rules', () => {
    test('should handle Account industry validation', () => {
      const formula = 'OR(ISBLANK(Industry), ISPICKVAL(Industry, "Technology"))';
      const record = { Industry: 'Technology' };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle Lead status validation', () => {
      const formula = 'NOT(AND(ISPICKVAL(Status, "Converted"), ISBLANK(ConvertedAccountId)))';
      const record = { 
        Status: 'Converted', 
        ConvertedAccountId: 'acc123' 
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle Case priority validation', () => {
      const formula = 'IF(ISPICKVAL(Priority, "High"), ISNOTBLANK(Description), true)';
      const record = { 
        Priority: 'High', 
        Description: 'Critical issue' 
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });

    test('should handle multi-field dependency validation', () => {
      const formula = 'NOT(AND(ISBLANK(BillingStreet), ISNOTBLANK(BillingCity)))';
      const record = { 
        BillingStreet: '123 Main St', 
        BillingCity: 'Springfield' 
      };
      expect(evaluator.evaluate(formula, record)).toBe(true);
    });
  });
});