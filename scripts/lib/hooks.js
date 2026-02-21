/**
 * Hook Template Library
 * Category-aware hook selection for TikTok/Reels videos
 * 
 * Based on @codesinred style analysis:
 * - Varied hooks prevent content fatigue
 * - Category-specific language performs better
 * - Price integration in hooks drives clicks
 */

const HOOK_TEMPLATES = {
  // Beauty & Skincare
  skincare: [
    "Why did no one tell me about this?",
    "My skin has never looked better",
    "This ${price} skincare find is insane",
    "I finally found the one",
    "POV: You discover this for ${price}",
    "This changed my entire routine",
    "Run don't walk for this deal"
  ],
  
  beauty: [
    "This is the one everyone's talking about",
    "Beauty TikTok made me buy this",
    "Best ${price} I ever spent",
    "Why is no one talking about this?",
    "I'm obsessed with this find",
    "This ${price} dupe is actually better"
  ],
  
  // Home & Living
  home: [
    "I found the perfect solution",
    "This thing actually works",
    "My home needed this for ${price}",
    "Amazon came through again",
    "This ${price} find fixed everything",
    "Why did I wait so long to get this?"
  ],
  
  'home-decor': [
    "This made my space look expensive",
    "The ${price} upgrade you need",
    "Interior TikTok approved",
    "This changed my whole room",
    "Best Amazon home find yet"
  ],
  
  // Tech & Gadgets
  tech: [
    "Best ${price} I've ever spent",
    "This tech under ${price} is insane",
    "I tested this for a week",
    "Tech TikTok was right about this",
    "This gadget actually delivers",
    "Why is this only ${price}?"
  ],
  
  // Kitchen & Food
  kitchen: [
    "My kitchen needed this",
    "This ${price} gadget is a game changer",
    "CleanTok made me buy this",
    "I use this literally every day",
    "Best kitchen find under ${price}"
  ],
  
  // Fitness & Health
  fitness: [
    "This changed my workout",
    "Gym TikTok was onto something",
    "The ${price} investment that paid off",
    "I wish I bought this sooner",
    "This fitness find actually works"
  ],
  
  // Fashion & Accessories
  fashion: [
    "The ${price} piece everyone needs",
    "This look for only ${price}",
    "Fashion TikTok approved",
    "I get compliments every time",
    "The viral find that's worth it"
  ],
  
  footwear: [
    "Most comfortable at ${price}",
    "These are the ones",
    "I wear these literally everywhere",
    "The comfy shoes you need"
  ],
  
  // General / Default
  default: [
    "Just found this for under ${price}",
    "This Amazon find is actually good",
    "I can't believe this is only ${price}",
    "Amazon did something right",
    "The ${price} find you need",
    "This is going viral for a reason",
    "POV: Best ${price} purchase",
    "I finally caved and got this"
  ],
  
  // Urgency/Deal hooks
  deal: [
    "This won't last long",
    "The deal everyone's running for",
    "Amazon made a pricing mistake",
    "Run before this sells out",
    "Limited time at ${price}"
  ]
};

/**
 * Select a hook based on product category and price
 * @param {Object} options
 * @param {string} options.category - Product category
 * @param {string} options.price - Product price (e.g., "$19.99")
 * @param {string} options.productName - Product name (for context)
 * @param {boolean} options.isOnSale - Whether product is discounted
 * @returns {string} Selected hook text
 */
function selectHook({ category = 'default', price = '$20', productName = '', isOnSale = false }) {
  // Normalize category
  const normalizedCategory = category.toLowerCase().replace(/[^a-z-]/g, '');
  
  // Get category-specific templates, fall back to default
  let templates = HOOK_TEMPLATES[normalizedCategory] || HOOK_TEMPLATES.default;
  
  // If on sale, add some deal hooks to the mix
  if (isOnSale) {
    templates = [...templates, ...HOOK_TEMPLATES.deal.slice(0, 2)];
  }
  
  // Select random template
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Replace price placeholder
  return template.replace(/\${price}/g, price);
}

/**
 * Get all hooks for a category (for A/B testing)
 * @param {string} category
 * @returns {string[]}
 */
function getHooksForCategory(category) {
  const normalizedCategory = category.toLowerCase().replace(/[^a-z-]/g, '');
  return HOOK_TEMPLATES[normalizedCategory] || HOOK_TEMPLATES.default;
}

/**
 * Get all available categories
 * @returns {string[]}
 */
function getCategories() {
  return Object.keys(HOOK_TEMPLATES);
}

module.exports = {
  HOOK_TEMPLATES,
  selectHook,
  getHooksForCategory,
  getCategories
};
