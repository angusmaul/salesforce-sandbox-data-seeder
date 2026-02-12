/**
 * Tests for Semantic Field Data Library
 *
 * Validates generators produce correct data types, correlations work,
 * and all category/subcategory combinations return values.
 */

const {
  DEPARTMENT_JOB_TITLES,
  DEPARTMENTS,
  COUNTRY_PHONE_FORMATS,
  COUNTRY_MOBILE_FORMATS,
  COMPANY_SIZE_PROFILES,
  SALUTATIONS,
  INDUSTRIES,
  CATEGORIES,
  person,
  company,
  address,
  financial,
  temporal,
  content,
  communication,
  identifier,
  getGenerator,
  generateFromLibrary,
  listAvailableGenerators,
  buildCorrelatedContext
} = require('./field-data-library');

// ---------------------------------------------------------------------------
// Helper: assert value is non-null string with content
// ---------------------------------------------------------------------------
function expectNonEmptyString(value, label) {
  expect(value).toBeDefined();
  expect(typeof value).toBe('string');
  expect(value.length).toBeGreaterThan(0);
  if (process.env.VERBOSE) console.log(`  ${label}: "${value}"`);
}

function expectNumber(value, label, { min, max } = {}) {
  expect(value).toBeDefined();
  expect(typeof value).toBe('number');
  expect(Number.isNaN(value)).toBe(false);
  if (min !== undefined) expect(value).toBeGreaterThanOrEqual(min);
  if (max !== undefined) expect(value).toBeLessThanOrEqual(max);
  if (process.env.VERBOSE) console.log(`  ${label}: ${value}`);
}

// ---------------------------------------------------------------------------
// Correlation Data Maps
// ---------------------------------------------------------------------------

describe('Correlation Data Maps', () => {
  test('DEPARTMENT_JOB_TITLES has entries for all DEPARTMENTS', () => {
    console.log(`DEPARTMENTS count: ${DEPARTMENTS.length}`);
    for (const dept of DEPARTMENTS) {
      const titles = DEPARTMENT_JOB_TITLES[dept];
      expect(titles).toBeDefined();
      expect(Array.isArray(titles)).toBe(true);
      expect(titles.length).toBeGreaterThanOrEqual(5);
      console.log(`  ${dept}: ${titles.length} job titles`);
    }
  });

  test('COUNTRY_PHONE_FORMATS covers major countries', () => {
    const expected = ['AU', 'US', 'CA', 'GB'];
    for (const code of expected) {
      expect(COUNTRY_PHONE_FORMATS[code]).toBeDefined();
      expect(typeof COUNTRY_PHONE_FORMATS[code].generator).toBe('function');
      const phone = COUNTRY_PHONE_FORMATS[code].generator();
      expectNonEmptyString(phone, `${code} phone`);
      expect(phone).toMatch(/^\+/); // starts with +
    }
  });

  test('COUNTRY_MOBILE_FORMATS generates valid mobile numbers', () => {
    for (const [code, gen] of Object.entries(COUNTRY_MOBILE_FORMATS)) {
      const mobile = gen();
      expectNonEmptyString(mobile, `${code} mobile`);
      expect(mobile).toMatch(/^\+/);
    }
  });

  test('COMPANY_SIZE_PROFILES have consistent ranges', () => {
    for (const [size, profile] of Object.entries(COMPANY_SIZE_PROFILES)) {
      console.log(`  ${size}: revenue ${profile.revenue.min}-${profile.revenue.max}, employees ${profile.employees.min}-${profile.employees.max}`);
      expect(profile.revenue.min).toBeLessThan(profile.revenue.max);
      expect(profile.employees.min).toBeLessThan(profile.employees.max);
      expect(profile.dealSize.min).toBeLessThan(profile.dealSize.max);
    }

    // Size ordering makes sense
    expect(COMPANY_SIZE_PROFILES.small.revenue.max).toBeLessThanOrEqual(COMPANY_SIZE_PROFILES.medium.revenue.min);
    expect(COMPANY_SIZE_PROFILES.medium.revenue.max).toBeLessThanOrEqual(COMPANY_SIZE_PROFILES.enterprise.revenue.min);
  });
});

// ---------------------------------------------------------------------------
// Person generators
// ---------------------------------------------------------------------------

describe('person generators', () => {
  test('firstName returns a string', () => {
    expectNonEmptyString(person.firstName({}), 'firstName');
  });

  test('lastName returns a string', () => {
    expectNonEmptyString(person.lastName({}), 'lastName');
  });

  test('fullName returns a string with a space', () => {
    const name = person.fullName({});
    expectNonEmptyString(name, 'fullName');
    expect(name).toMatch(/\s/);
  });

  test('jobTitle correlates with department when provided', () => {
    const dept = 'Engineering';
    const title = person.jobTitle({ department: dept });
    expectNonEmptyString(title, 'jobTitle(Engineering)');
    expect(DEPARTMENT_JOB_TITLES[dept]).toContain(title);
    console.log(`  department=${dept} → jobTitle="${title}" (valid match)`);
  });

  test('jobTitle returns something when no department', () => {
    expectNonEmptyString(person.jobTitle({}), 'jobTitle(no dept)');
  });

  test('department returns a known department', () => {
    const dept = person.department({});
    expect(DEPARTMENTS).toContain(dept);
    console.log(`  department: "${dept}"`);
  });

  test('salutation returns a known salutation', () => {
    const sal = person.salutation({});
    expect(SALUTATIONS).toContain(sal);
  });
});

// ---------------------------------------------------------------------------
// Company generators
// ---------------------------------------------------------------------------

describe('company generators', () => {
  test('name generates unique company names', () => {
    const names = new Set();
    for (let i = 0; i < 20; i++) {
      names.add(company.name({}));
    }
    // With timestamps, all should be unique
    expect(names.size).toBe(20);
    console.log(`  20 unique names generated`);
  });

  test('revenue respects company profile', () => {
    const small = company.revenue({ companyProfile: 'small' });
    const enterprise = company.revenue({ companyProfile: 'enterprise' });

    expectNumber(small, 'small revenue', {
      min: COMPANY_SIZE_PROFILES.small.revenue.min,
      max: COMPANY_SIZE_PROFILES.small.revenue.max
    });
    expectNumber(enterprise, 'enterprise revenue', {
      min: COMPANY_SIZE_PROFILES.enterprise.revenue.min,
      max: COMPANY_SIZE_PROFILES.enterprise.revenue.max
    });
  });

  test('employeeCount respects company profile', () => {
    const medium = company.employeeCount({ companyProfile: 'medium' });
    expectNumber(medium, 'medium employees', {
      min: COMPANY_SIZE_PROFILES.medium.employees.min,
      max: COMPANY_SIZE_PROFILES.medium.employees.max
    });
  });

  test('industry returns a known industry', () => {
    const ind = company.industry({});
    expect(INDUSTRIES).toContain(ind);
  });

  test('ticker returns uppercase alpha string', () => {
    const t = company.ticker({});
    expectNonEmptyString(t, 'ticker');
    expect(t).toMatch(/^[A-Z]{2,5}$/);
  });

  test('website returns a URL', () => {
    const url = company.website({});
    expectNonEmptyString(url, 'website');
    expect(url).toMatch(/^https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// Address generators
// ---------------------------------------------------------------------------

describe('address generators', () => {
  test('street returns a street address', () => {
    expectNonEmptyString(address.street({}), 'street');
  });

  test('city returns a city name', () => {
    expectNonEmptyString(address.city({}), 'city');
  });

  test('state correlates with country code', () => {
    const auState = address.state({ countryCode: 'AU' });
    expect(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']).toContain(auState);
    console.log(`  AU state: ${auState}`);

    const gbState = address.state({ countryCode: 'GB' });
    expect(gbState).toBe('');
    console.log(`  GB state: "${gbState}" (empty as expected)`);
  });

  test('postalCode formats correctly for AU', () => {
    const code = address.postalCode({ countryCode: 'AU' });
    expect(code).toMatch(/^\d{4}$/);
    console.log(`  AU postal: ${code}`);
  });

  test('postalCode formats correctly for US', () => {
    const code = address.postalCode({ countryCode: 'US' });
    expect(code).toMatch(/^\d{5}$/);
    console.log(`  US postal: ${code}`);
  });

  test('countryCode returns a valid code', () => {
    const code = address.countryCode({});
    expect(['AU', 'US', 'CA', 'GB']).toContain(code);
  });
});

// ---------------------------------------------------------------------------
// Financial generators
// ---------------------------------------------------------------------------

describe('financial generators', () => {
  test('amount respects company profile', () => {
    const small = financial.amount({ companyProfile: 'small' });
    expectNumber(small, 'small deal', {
      min: COMPANY_SIZE_PROFILES.small.dealSize.min,
      max: COMPANY_SIZE_PROFILES.small.dealSize.max
    });
  });

  test('taxRate is within 0-25', () => {
    for (let i = 0; i < 10; i++) {
      expectNumber(financial.taxRate({}), 'taxRate', { min: 0, max: 25 });
    }
  });

  test('probability is within 5-100', () => {
    for (let i = 0; i < 10; i++) {
      expectNumber(financial.probability({}), 'probability', { min: 5, max: 100 });
    }
  });

  test('quantity is positive integer', () => {
    const q = financial.quantity({});
    expect(Number.isInteger(q)).toBe(true);
    expect(q).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Temporal generators
// ---------------------------------------------------------------------------

describe('temporal generators', () => {
  test('birthDate produces a valid date string in the past', () => {
    const d = temporal.birthDate({});
    expectNonEmptyString(d, 'birthDate');
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = new Date(d);
    expect(parsed.getTime()).toBeLessThan(Date.now());
    console.log(`  birthDate: ${d}`);
  });

  test('closeDate is in the future', () => {
    const d = temporal.closeDate({});
    const parsed = new Date(d);
    // Allow a 1-day tolerance for edge cases
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(parsed.getTime()).toBeGreaterThan(yesterday.getTime());
    console.log(`  closeDate: ${d}`);
  });

  test('startDate is in the past', () => {
    const d = temporal.startDate({});
    const parsed = new Date(d);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(parsed.getTime()).toBeLessThan(tomorrow.getTime());
  });
});

// ---------------------------------------------------------------------------
// Content generators
// ---------------------------------------------------------------------------

describe('content generators', () => {
  test('description returns a paragraph', () => {
    const d = content.description({});
    expectNonEmptyString(d, 'description');
    expect(d.length).toBeGreaterThan(20);
  });

  test('subject returns business-like text', () => {
    const s = content.subject({});
    expectNonEmptyString(s, 'subject');
    expect(s).toMatch(/ - /); // Contains "topic - company"
    console.log(`  subject: "${s}"`);
  });
});

// ---------------------------------------------------------------------------
// Communication generators
// ---------------------------------------------------------------------------

describe('communication generators', () => {
  test('email correlates with first/last name', () => {
    const email = communication.email({ firstName: 'John', lastName: 'Doe' });
    expectNonEmptyString(email, 'email');
    expect(email).toMatch(/john\.doe@/);
    console.log(`  correlated email: ${email}`);
  });

  test('phoneGeneric correlates with country', () => {
    const phone = communication.phoneGeneric({ countryCode: 'GB' });
    expect(phone).toMatch(/^\+44/);
    console.log(`  GB phone: ${phone}`);

    const usPhone = communication.phoneGeneric({ countryCode: 'US' });
    expect(usPhone).toMatch(/^\+1/);
    console.log(`  US phone: ${usPhone}`);
  });

  test('mobile correlates with country', () => {
    const mobile = communication.mobile({ countryCode: 'AU' });
    expect(mobile).toMatch(/^\+61 4/);
    console.log(`  AU mobile: ${mobile}`);
  });

  test('linkedin contains name', () => {
    const url = communication.linkedin({ firstName: 'Jane', lastName: 'Smith' });
    expect(url).toMatch(/linkedin\.com\/in\/jane-smith/);
    console.log(`  linkedin: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// Identifier generators
// ---------------------------------------------------------------------------

describe('identifier generators', () => {
  test('accountNumber matches pattern', () => {
    const n = identifier.accountNumber({});
    expect(n).toMatch(/^ACC-\d{8}$/);
  });

  test('serialNumber matches pattern', () => {
    const n = identifier.serialNumber({});
    expect(n).toMatch(/^SN[A-Z0-9]{10}$/);
  });

  test('sku matches pattern', () => {
    const n = identifier.sku({});
    expect(n).toMatch(/^SKU-[A-Z0-9]{8}$/);
  });

  test('externalId matches pattern', () => {
    const n = identifier.externalId({});
    expect(n).toMatch(/^EXT-[A-Z0-9]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

describe('getGenerator', () => {
  test('returns function for valid category.subcategory', () => {
    const gen = getGenerator('person', 'firstName');
    expect(typeof gen).toBe('function');
  });

  test('returns null for invalid category', () => {
    expect(getGenerator('nonexistent', 'foo')).toBeNull();
  });

  test('returns null for invalid subcategory', () => {
    expect(getGenerator('person', 'nonexistent')).toBeNull();
  });
});

describe('generateFromLibrary', () => {
  test('returns a value for valid pair', () => {
    const value = generateFromLibrary('person', 'firstName', {});
    expectNonEmptyString(value, 'generateFromLibrary(person.firstName)');
  });

  test('returns null for invalid pair', () => {
    expect(generateFromLibrary('bogus', 'bogus', {})).toBeNull();
  });
});

describe('listAvailableGenerators', () => {
  test('returns all category.subcategory pairs', () => {
    const list = listAvailableGenerators();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(30);
    console.log(`  Total generators: ${list.length}`);

    // Verify structure
    for (const item of list) {
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('subcategory');
    }

    // Verify known entries
    expect(list).toContainEqual({ category: 'person', subcategory: 'firstName' });
    expect(list).toContainEqual({ category: 'financial', subcategory: 'amount' });
    expect(list).toContainEqual({ category: 'communication', subcategory: 'email' });
  });
});

describe('buildCorrelatedContext', () => {
  test('builds department for department_jobtitle correlation', () => {
    const plan = {
      fieldMappings: {},
      correlations: [{ type: 'department_jobtitle', fields: ['Department', 'Title'] }]
    };
    const ctx = buildCorrelatedContext(plan, 0, 'medium');
    expect(ctx.department).toBeDefined();
    expect(DEPARTMENTS).toContain(ctx.department);
    expect(ctx.companyProfile).toBe('medium');
    console.log(`  correlated context: department=${ctx.department}`);
  });

  test('builds country for country_phone correlation', () => {
    const plan = {
      fieldMappings: {},
      correlations: [{ type: 'country_phone', fields: ['Phone', 'Country'] }]
    };
    const ctx = buildCorrelatedContext(plan, 0, 'small');
    expect(ctx.countryCode).toBeDefined();
    expect(Object.keys(COUNTRY_PHONE_FORMATS)).toContain(ctx.countryCode);
  });

  test('builds name for name_email correlation', () => {
    const plan = {
      fieldMappings: {},
      correlations: [{ type: 'name_email', fields: ['FirstName', 'Email'] }]
    };
    const ctx = buildCorrelatedContext(plan, 0);
    expect(ctx.firstName).toBeDefined();
    expect(ctx.lastName).toBeDefined();
  });

  test('returns base context when no correlations', () => {
    const ctx = buildCorrelatedContext({}, 0, 'enterprise');
    expect(ctx.companyProfile).toBe('enterprise');
    expect(Object.keys(ctx).length).toBe(1);
  });

  test('returns base context when plan is null', () => {
    const ctx = buildCorrelatedContext(null, 0);
    expect(ctx.companyProfile).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Exhaustive generator coverage: every subcategory should produce a value
// ---------------------------------------------------------------------------

describe('exhaustive generator coverage', () => {
  const generators = listAvailableGenerators();

  test.each(generators)('$category.$subcategory produces a non-null value', ({ category, subcategory }) => {
    const value = generateFromLibrary(category, subcategory, { companyProfile: 'medium' });
    expect(value).not.toBeNull();
    expect(value).not.toBeUndefined();
    console.log(`  ${category}.${subcategory} → ${typeof value === 'string' ? `"${value.substring(0, 50)}"` : value}`);
  });
});
