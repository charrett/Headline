// Test configuration - update these values for your environment
module.exports = {
  // Ghost configuration
  ghost: {
    url: 'http://localhost:2368',
    adminUrl: 'http://localhost:2368/ghost',
    // Admin API credentials (needed for creating test members)
    // Get these from Ghost Admin → Integrations → Custom Integration
    adminApiKey: process.env.GHOST_ADMIN_API_KEY || '', // Leave empty for basic tests
  },
  
  // API configuration
  api: {
    url: 'http://localhost:4000/api',
  },
  
  // Test article - must be a paid article
  testArticle: {
    slug: 'building-momentum-for-change-in-enterprise',
    title: 'Building Momentum for Change in Enterprise',
    url: 'http://localhost:2368/building-momentum-for-change-in-enterprise/',
  },
  
  // Stripe test card
  stripe: {
    cardNumber: '4242424242424242',
    expiry: '12/34',
    cvc: '123',
    zip: '12345',
  },
  
  // Test users
  users: {
    anonymous: {
      email: 'anonymous-test@example.com',
      // This user doesn't exist yet - will be created during purchase
    },
    freeMember: {
      email: 'free-member@example.com',
      password: 'TestPassword123!',
      // This user should exist in Ghost as a free member
    },
    paidMember: {
      email: 'paid-member@example.com',
      password: 'TestPassword123!',
      // This user should exist in Ghost as a paid subscriber
    },
  },
};
