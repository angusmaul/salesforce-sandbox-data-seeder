/**
 * Semantic Field Data Library
 *
 * Structured library of data generators organized by semantic category.
 * Each generator accepts an optional context object for cross-field correlations
 * (e.g., department → matching job titles, country → matching phone format).
 *
 * Reuses WESTERN_COUNTRIES_DATA from salesforce-field-types.js — no duplication.
 */

const { faker } = require('@faker-js/faker');

// ---------------------------------------------------------------------------
// Correlation Data Maps
// ---------------------------------------------------------------------------

const DEPARTMENT_JOB_TITLES = {
  Sales: [
    'Account Executive', 'Sales Manager', 'Sales Director', 'Business Development Rep',
    'Sales Operations Analyst', 'Regional Sales Manager', 'VP of Sales',
    'Inside Sales Rep', 'Enterprise Account Executive', 'Sales Engineer'
  ],
  Marketing: [
    'Marketing Manager', 'Content Strategist', 'Digital Marketing Specialist',
    'Brand Manager', 'Marketing Director', 'SEO Analyst', 'Product Marketing Manager',
    'Growth Marketing Lead', 'Campaign Manager', 'Marketing Coordinator'
  ],
  Engineering: [
    'Software Engineer', 'Senior Developer', 'Engineering Manager', 'DevOps Engineer',
    'QA Engineer', 'Tech Lead', 'Principal Engineer', 'Frontend Developer',
    'Backend Developer', 'Full Stack Engineer'
  ],
  HR: [
    'HR Manager', 'Recruiter', 'HR Business Partner', 'Talent Acquisition Specialist',
    'People Operations Manager', 'Compensation Analyst', 'HR Director',
    'Employee Relations Specialist', 'Learning & Development Manager', 'HR Coordinator'
  ],
  Finance: [
    'Financial Analyst', 'Controller', 'CFO', 'Accountant', 'Treasury Analyst',
    'Accounts Payable Specialist', 'Finance Manager', 'Auditor',
    'Revenue Analyst', 'Financial Planning Manager'
  ],
  Operations: [
    'Operations Manager', 'Supply Chain Analyst', 'Logistics Coordinator',
    'Operations Director', 'Process Improvement Specialist', 'Procurement Manager',
    'Warehouse Manager', 'Facilities Manager', 'Operations Analyst', 'COO'
  ],
  Support: [
    'Support Engineer', 'Customer Success Manager', 'Help Desk Analyst',
    'Technical Support Specialist', 'Support Team Lead', 'Customer Support Rep',
    'Escalation Engineer', 'Support Operations Manager', 'Service Desk Analyst',
    'Customer Experience Manager'
  ],
  Legal: [
    'General Counsel', 'Corporate Lawyer', 'Paralegal', 'Contract Manager',
    'Compliance Officer', 'Legal Operations Manager', 'IP Attorney',
    'Litigation Associate', 'Legal Analyst', 'Privacy Counsel'
  ],
  IT: [
    'System Administrator', 'Network Engineer', 'IT Manager', 'Security Analyst',
    'Database Administrator', 'IT Director', 'Cloud Architect', 'IT Support Specialist',
    'Infrastructure Engineer', 'CTO'
  ],
  'Product': [
    'Product Manager', 'Product Owner', 'Director of Product', 'VP Product',
    'Product Analyst', 'Product Designer', 'Technical Product Manager',
    'Associate Product Manager', 'Chief Product Officer', 'Product Strategist'
  ]
};

const DEPARTMENTS = Object.keys(DEPARTMENT_JOB_TITLES);

const COUNTRY_PHONE_FORMATS = {
  AU: { prefix: '+61', generator: () => `+61 ${faker.helpers.arrayElement(['2', '3', '7', '8'])} ${faker.string.numeric(4)} ${faker.string.numeric(4)}` },
  US: { prefix: '+1', generator: () => `+1 (${faker.string.numeric(3)}) ${faker.string.numeric(3)}-${faker.string.numeric(4)}` },
  CA: { prefix: '+1', generator: () => `+1 (${faker.helpers.arrayElement(['416', '604', '514', '403', '613'])}) ${faker.string.numeric(3)}-${faker.string.numeric(4)}` },
  GB: { prefix: '+44', generator: () => `+44 ${faker.helpers.arrayElement(['20', '121', '161', '131'])} ${faker.string.numeric(4)} ${faker.string.numeric(4)}` },
  DE: { prefix: '+49', generator: () => `+49 ${faker.helpers.arrayElement(['30', '40', '69', '89'])} ${faker.string.numeric(7)}` },
  FR: { prefix: '+33', generator: () => `+33 ${faker.helpers.arrayElement(['1', '4', '5', '6'])} ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}` },
  NZ: { prefix: '+64', generator: () => `+64 ${faker.helpers.arrayElement(['9', '4', '3'])} ${faker.string.numeric(3)} ${faker.string.numeric(4)}` },
  JP: { prefix: '+81', generator: () => `+81 ${faker.helpers.arrayElement(['3', '6', '45', '52'])} ${faker.string.numeric(4)} ${faker.string.numeric(4)}` },
  IN: { prefix: '+91', generator: () => `+91 ${faker.string.numeric(5)} ${faker.string.numeric(5)}` }
};

const COUNTRY_MOBILE_FORMATS = {
  AU: () => `+61 4${faker.string.numeric(2)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`,
  US: () => `+1 (${faker.string.numeric(3)}) ${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
  CA: () => `+1 (${faker.string.numeric(3)}) ${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
  GB: () => `+44 7${faker.string.numeric(3)} ${faker.string.numeric(6)}`,
  DE: () => `+49 1${faker.helpers.arrayElement(['5', '6', '7'])}${faker.string.numeric(1)} ${faker.string.numeric(7)}`,
  FR: () => `+33 6 ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}`,
  NZ: () => `+64 2${faker.string.numeric(1)} ${faker.string.numeric(3)} ${faker.string.numeric(4)}`,
  JP: () => `+81 ${faker.helpers.arrayElement(['70', '80', '90'])} ${faker.string.numeric(4)} ${faker.string.numeric(4)}`,
  IN: () => `+91 ${faker.helpers.arrayElement(['7', '8', '9'])}${faker.string.numeric(4)} ${faker.string.numeric(5)}`
};

const COUNTRY_CODE_TO_NAME = {
  AU: 'Australia', US: 'United States', CA: 'Canada', GB: 'United Kingdom',
  DE: 'Germany', FR: 'France', NZ: 'New Zealand', JP: 'Japan', IN: 'India'
};

const COMPANY_SIZE_PROFILES = {
  small: {
    label: 'Small Business',
    revenue: { min: 100000, max: 5000000 },
    employees: { min: 1, max: 50 },
    dealSize: { min: 1000, max: 50000 },
    discount: { min: 0, max: 10 }
  },
  medium: {
    label: 'Medium Business',
    revenue: { min: 5000000, max: 100000000 },
    employees: { min: 50, max: 500 },
    dealSize: { min: 10000, max: 500000 },
    discount: { min: 0, max: 20 }
  },
  enterprise: {
    label: 'Enterprise',
    revenue: { min: 100000000, max: 10000000000 },
    employees: { min: 500, max: 100000 },
    dealSize: { min: 100000, max: 10000000 },
    discount: { min: 0, max: 30 }
  }
};

const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail',
  'Education', 'Energy', 'Telecommunications', 'Real Estate', 'Transportation',
  'Media', 'Hospitality', 'Consulting', 'Insurance', 'Pharmaceuticals'
];

// ---------------------------------------------------------------------------
// Category Generators
// ---------------------------------------------------------------------------

const person = {
  firstName: (_ctx) => faker.person.firstName(),
  lastName: (_ctx) => faker.person.lastName(),
  fullName: (_ctx) => faker.person.fullName(),
  middleName: (_ctx) => faker.person.middleName(),
  salutation: (_ctx) => faker.helpers.arrayElement(SALUTATIONS),

  jobTitle: (ctx) => {
    const dept = ctx?.department;
    if (dept && DEPARTMENT_JOB_TITLES[dept]) {
      return faker.helpers.arrayElement(DEPARTMENT_JOB_TITLES[dept]);
    }
    return faker.person.jobTitle();
  },

  department: (_ctx) => faker.helpers.arrayElement(DEPARTMENTS),

  suffix: (_ctx) => faker.helpers.arrayElement(['Jr.', 'Sr.', 'III', 'IV', 'PhD', 'MD', 'Esq.', ''])
};

const company = {
  name: (_ctx) => {
    const uniqueId = Date.now().toString().slice(-8) + faker.string.numeric(3);
    return `${faker.company.name()} ${uniqueId}`;
  },

  industry: (_ctx) => faker.helpers.arrayElement(INDUSTRIES),

  revenueSmall: (_ctx) => faker.number.float({ min: COMPANY_SIZE_PROFILES.small.revenue.min, max: COMPANY_SIZE_PROFILES.small.revenue.max, multipleOf: 0.01 }),
  revenueMedium: (_ctx) => faker.number.float({ min: COMPANY_SIZE_PROFILES.medium.revenue.min, max: COMPANY_SIZE_PROFILES.medium.revenue.max, multipleOf: 0.01 }),
  revenueEnterprise: (_ctx) => faker.number.float({ min: COMPANY_SIZE_PROFILES.enterprise.revenue.min, max: COMPANY_SIZE_PROFILES.enterprise.revenue.max, multipleOf: 0.01 }),
  revenue: (ctx) => {
    const profile = ctx?.companyProfile || 'medium';
    const range = COMPANY_SIZE_PROFILES[profile]?.revenue || COMPANY_SIZE_PROFILES.medium.revenue;
    return faker.number.float({ min: range.min, max: range.max, multipleOf: 0.01 });
  },

  employeeCount: (ctx) => {
    const profile = ctx?.companyProfile || 'medium';
    const range = COMPANY_SIZE_PROFILES[profile]?.employees || COMPANY_SIZE_PROFILES.medium.employees;
    return faker.number.int({ min: range.min, max: range.max });
  },

  website: (_ctx) => faker.internet.url(),

  ticker: (_ctx) => faker.string.alpha({ length: faker.number.int({ min: 2, max: 5 }), casing: 'upper' }),

  description: (_ctx) => {
    const industry = faker.helpers.arrayElement(INDUSTRIES);
    const size = faker.helpers.arrayElement(['leading', 'growing', 'innovative', 'established', 'emerging']);
    return `A ${size} ${industry.toLowerCase()} company specializing in ${faker.company.buzzPhrase()}.`;
  }
};

const address = {
  street: (_ctx) => faker.location.streetAddress(),
  city: (_ctx) => faker.location.city(),
  state: (ctx) => {
    const country = ctx?.countryCode;
    // Defer to WESTERN_COUNTRIES_DATA from salesforce-field-types if available
    if (country === 'US') return faker.location.state({ abbreviated: true });
    if (country === 'AU') return faker.helpers.arrayElement(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);
    if (country === 'CA') return faker.helpers.arrayElement(['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
    if (country === 'GB') return ''; // UK has no states in Salesforce
    return faker.location.state({ abbreviated: true });
  },
  postalCode: (ctx) => {
    const country = ctx?.countryCode;
    if (country === 'AU') return faker.string.numeric(4);
    if (country === 'US') return faker.location.zipCode('#####');
    if (country === 'CA') return `${faker.string.alpha({ length: 1, casing: 'upper' })}${faker.string.numeric(1)}${faker.string.alpha({ length: 1, casing: 'upper' })} ${faker.string.numeric(1)}${faker.string.alpha({ length: 1, casing: 'upper' })}${faker.string.numeric(1)}`;
    if (country === 'GB') return `${faker.string.alpha({ length: 2, casing: 'upper' })}${faker.string.numeric(1)} ${faker.string.numeric(1)}${faker.string.alpha({ length: 2, casing: 'upper' })}`;
    return faker.location.zipCode();
  },
  country: (ctx) => {
    const code = ctx?.countryCode;
    if (code) return COUNTRY_CODE_TO_NAME[code] || faker.helpers.arrayElement(['Australia', 'United States', 'Canada', 'United Kingdom']);
    return faker.helpers.arrayElement(['Australia', 'United States', 'Canada', 'United Kingdom']);
  },
  countryCode: (ctx) => {
    return ctx?.countryCode || faker.helpers.arrayElement(['AU', 'US', 'CA', 'GB']);
  }
};

const financial = {
  amountSmall: (_ctx) => faker.number.float({ min: 10, max: 5000, multipleOf: 0.01 }),
  amountMedium: (_ctx) => faker.number.float({ min: 5000, max: 100000, multipleOf: 0.01 }),
  amountLarge: (_ctx) => faker.number.float({ min: 100000, max: 10000000, multipleOf: 0.01 }),
  amount: (ctx) => {
    const profile = ctx?.companyProfile || 'medium';
    const range = COMPANY_SIZE_PROFILES[profile]?.dealSize || COMPANY_SIZE_PROFILES.medium.dealSize;
    return faker.number.float({ min: range.min, max: range.max, multipleOf: 0.01 });
  },

  discount: (ctx) => {
    const profile = ctx?.companyProfile || 'medium';
    const maxDiscount = COMPANY_SIZE_PROFILES[profile]?.discount?.max || 20;
    return faker.number.float({ min: 0, max: maxDiscount, multipleOf: 0.01 });
  },

  taxRate: (_ctx) => faker.number.float({ min: 0, max: 25, multipleOf: 0.01 }),
  probability: (_ctx) => faker.number.int({ min: 5, max: 100 }),
  quantity: (_ctx) => faker.number.int({ min: 1, max: 500 }),
  unitPrice: (_ctx) => faker.number.float({ min: 1, max: 10000, multipleOf: 0.01 }),
  percentage: (_ctx) => faker.number.float({ min: 0, max: 100, multipleOf: 0.01 })
};

const temporal = {
  birthDate: (_ctx) => {
    const today = new Date();
    const maxAge = new Date(today.getFullYear() - 65, today.getMonth(), today.getDate());
    const minAge = new Date(today.getFullYear() - 22, today.getMonth(), today.getDate());
    return faker.date.between({ from: maxAge, to: minAge }).toISOString().split('T')[0];
  },

  pastDate: (_ctx) => faker.date.recent({ days: 365 }).toISOString().split('T')[0],

  futureDate: (_ctx) => faker.date.soon({ days: 365 }).toISOString().split('T')[0],

  closeDate: (_ctx) => {
    const start = new Date();
    const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    return faker.date.between({ from: start, to: end }).toISOString().split('T')[0];
  },

  startDate: (_ctx) => {
    const today = new Date();
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
    return faker.date.between({ from: sixMonthsAgo, to: today }).toISOString().split('T')[0];
  },

  endDate: (_ctx) => {
    const today = new Date();
    const oneYearFromNow = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    return faker.date.between({ from: today, to: oneYearFromNow }).toISOString().split('T')[0];
  },

  recentDatetime: (_ctx) => faker.date.recent({ days: 365 }).toISOString(),
  futureDatetime: (_ctx) => faker.date.soon({ days: 365 }).toISOString()
};

const content = {
  description: (_ctx) => faker.lorem.paragraph(),
  shortDescription: (_ctx) => faker.lorem.sentence(),
  notes: (_ctx) => faker.lorem.sentences(2),
  subject: (_ctx) => {
    const topics = ['Follow up', 'Meeting request', 'Proposal review', 'Contract update', 'Quarterly check-in', 'Product demo', 'Onboarding', 'Support escalation'];
    return `${faker.helpers.arrayElement(topics)} - ${faker.company.name()}`;
  },
  comment: (_ctx) => faker.lorem.sentences(faker.number.int({ min: 1, max: 3 })),
  longText: (_ctx) => faker.lorem.paragraphs(3)
};

const communication = {
  email: (ctx) => {
    const first = ctx?.firstName || faker.person.firstName();
    const last = ctx?.lastName || faker.person.lastName();
    const domain = faker.helpers.arrayElement(['example.com', 'test.com', 'demo.org', 'company.com', 'corp.net']);
    return `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
  },

  phoneUS: (_ctx) => COUNTRY_PHONE_FORMATS.US.generator(),
  phoneAU: (_ctx) => COUNTRY_PHONE_FORMATS.AU.generator(),
  phoneUK: (_ctx) => COUNTRY_PHONE_FORMATS.GB.generator(),
  phoneGeneric: (ctx) => {
    const country = ctx?.countryCode || 'US';
    const format = COUNTRY_PHONE_FORMATS[country];
    return format ? format.generator() : COUNTRY_PHONE_FORMATS.US.generator();
  },

  mobile: (ctx) => {
    const country = ctx?.countryCode || 'US';
    const gen = COUNTRY_MOBILE_FORMATS[country];
    return gen ? gen() : COUNTRY_MOBILE_FORMATS.US();
  },

  fax: (ctx) => {
    const country = ctx?.countryCode || 'AU';
    const format = COUNTRY_PHONE_FORMATS[country];
    return format ? format.generator() : COUNTRY_PHONE_FORMATS.AU.generator();
  },

  url: (_ctx) => faker.internet.url(),

  linkedin: (ctx) => {
    const first = ctx?.firstName || faker.person.firstName();
    const last = ctx?.lastName || faker.person.lastName();
    return `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${faker.string.alphanumeric(6)}`;
  }
};

const identifier = {
  accountNumber: (_ctx) => `ACC-${faker.string.numeric(8)}`,
  serialNumber: (_ctx) => `SN${faker.string.alphanumeric(10).toUpperCase()}`,
  sku: (_ctx) => `SKU-${faker.string.alphanumeric(8).toUpperCase()}`,
  productCode: (_ctx) => `PROD-${faker.string.alphanumeric(6).toUpperCase()}`,
  externalId: (_ctx) => `EXT-${faker.string.alphanumeric(12).toUpperCase()}`,
  invoiceNumber: (_ctx) => `INV-${faker.string.numeric(8)}`,
  orderNumber: (_ctx) => `ORD-${faker.string.numeric(8)}`,
  caseNumber: (_ctx) => `CS-${faker.string.numeric(7)}`,
  contractNumber: (_ctx) => `CON-${faker.string.numeric(6)}`
};

// ---------------------------------------------------------------------------
// Category Registry — maps category.subcategory to generator functions
// ---------------------------------------------------------------------------

const CATEGORIES = {
  person,
  company,
  address,
  financial,
  temporal,
  content,
  communication,
  identifier
};

/**
 * Retrieve a generator function by category and subcategory.
 * Returns null if not found.
 * @param {string} category
 * @param {string} subcategory
 * @returns {Function|null}
 */
function getGenerator(category, subcategory) {
  const cat = CATEGORIES[category];
  if (!cat) return null;
  return cat[subcategory] || null;
}

/**
 * Generate a value using a category/subcategory pair.
 * @param {string} category
 * @param {string} subcategory
 * @param {Object} context - cross-field correlation context
 * @returns {*} generated value, or null if category not found
 */
function generateFromLibrary(category, subcategory, context = {}) {
  const gen = getGenerator(category, subcategory);
  if (!gen) return null;
  return gen(context);
}

/**
 * Return a flat list of all available category.subcategory combinations.
 * Useful for building prompts and UI dropdowns.
 * @returns {Array<{category: string, subcategory: string}>}
 */
function listAvailableGenerators() {
  const result = [];
  for (const [catName, catObj] of Object.entries(CATEGORIES)) {
    for (const subName of Object.keys(catObj)) {
      result.push({ category: catName, subcategory: subName });
    }
  }
  return result;
}

/**
 * Build correlated context from an AI generation plan's correlations.
 * Pre-generates shared values (like department) that downstream fields depend on.
 * @param {Object} planForObject - the AI plan for one object { fieldMappings, correlations }
 * @param {number} index - record index for variation
 * @param {string} companyProfile - 'small' | 'medium' | 'enterprise'
 * @returns {Object} context object with pre-generated correlated values
 */
function buildCorrelatedContext(planForObject, index, companyProfile = 'medium', selectedCountries = null) {
  const ctx = { companyProfile };
  // Use the user's selected countries, or fall back to defaults
  const countryCodes = (selectedCountries && selectedCountries.length > 0)
    ? selectedCountries
    : ['AU', 'US', 'CA', 'GB'];

  if (!planForObject?.correlations) {
    // Even without correlations, set countryCode if address fields exist
    if (planForObject?.fieldMappings) {
      const hasAddressField = Object.values(planForObject.fieldMappings)
        .some(m => m.category === 'address');
      if (hasAddressField) {
        ctx.countryCode = countryCodes[index % countryCodes.length];
      }
    }
    return ctx;
  }

  for (const correlation of planForObject.correlations) {
    const { type } = correlation;

    if (type === 'department_jobtitle') {
      if (!ctx.department) {
        ctx.department = DEPARTMENTS[index % DEPARTMENTS.length];
      }
    }

    if (type === 'country_phone' || type === 'country_address') {
      if (!ctx.countryCode) {
        ctx.countryCode = countryCodes[index % countryCodes.length];
      }
    }

    if (type === 'name_email') {
      if (!ctx.firstName) ctx.firstName = faker.person.firstName();
      if (!ctx.lastName) ctx.lastName = faker.person.lastName();
    }

    if (type === 'company_size') {
      ctx.companyProfile = companyProfile;
    }
  }

  // Ensure countryCode is always set when any address fields are in the plan
  if (!ctx.countryCode && planForObject.fieldMappings) {
    const hasAddressField = Object.values(planForObject.fieldMappings)
      .some(m => m.category === 'address');
    if (hasAddressField) {
      ctx.countryCode = countryCodes[index % countryCodes.length];
    }
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Correlation data maps
  DEPARTMENT_JOB_TITLES,
  DEPARTMENTS,
  COUNTRY_PHONE_FORMATS,
  COUNTRY_MOBILE_FORMATS,
  COUNTRY_CODE_TO_NAME,
  COMPANY_SIZE_PROFILES,
  SALUTATIONS,
  INDUSTRIES,

  // Category objects (for direct access)
  CATEGORIES,
  person,
  company,
  address,
  financial,
  temporal,
  content,
  communication,
  identifier,

  // Utility functions
  getGenerator,
  generateFromLibrary,
  listAvailableGenerators,
  buildCorrelatedContext
};
