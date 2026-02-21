/**
 * DailyDealFeed Click Tracking System
 * Tracks affiliate link clicks with product-level granularity
 * Works entirely client-side using localStorage
 */

const DealTracker = (function() {
  const STORAGE_KEY = 'ddf_click_analytics';
  const VERSION = '1.0.0';

  // Initialize analytics data structure
  function initData() {
    return {
      version: VERSION,
      firstVisit: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalClicks: 0,
      products: {},
      daily: {},
      sources: {},
      devices: {}
    };
  }

  // Get or create analytics data
  function getData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // Migrate old versions if needed
        if (!data.version) {
          return initData();
        }
        return data;
      }
    } catch (e) {
      console.warn('DealTracker: Error reading data', e);
    }
    return initData();
  }

  // Save analytics data
  function saveData(data) {
    try {
      data.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('DealTracker: Error saving data', e);
    }
  }

  // Get device type
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  // Get traffic source
  function getTrafficSource() {
    const ref = document.referrer;
    if (!ref) return 'direct';
    if (ref.includes('google.')) return 'google';
    if (ref.includes('facebook.') || ref.includes('fb.')) return 'facebook';
    if (ref.includes('twitter.') || ref.includes('t.co')) return 'twitter';
    if (ref.includes('instagram.')) return 'instagram';
    if (ref.includes('tiktok.')) return 'tiktok';
    if (ref.includes('youtube.')) return 'youtube';
    if (ref.includes('reddit.')) return 'reddit';
    if (ref.includes('telegram.')) return 'telegram';
    return 'other';
  }

  // Extract product info from link
  function extractProductInfo(link) {
    const href = link.href || '';
    const text = link.textContent || '';
    
    // Try to find product card
    const card = link.closest('.product-card') || link.closest('.featured-deal');
    
    let productName = 'Unknown';
    let productId = null;
    let price = null;
    let discount = null;

    if (card) {
      const titleEl = card.querySelector('.product-title, .featured-title');
      if (titleEl) productName = titleEl.textContent.trim();
      
      const priceEl = card.querySelector('.sale-price');
      if (priceEl) price = priceEl.textContent.trim();
      
      const discountEl = card.querySelector('.discount-badge');
      if (discountEl) discount = discountEl.textContent.trim();
    }

    // Extract ASIN from Amazon URL
    const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/i) || 
                      href.match(/\/product\/([A-Z0-9]{10})/i);
    if (asinMatch) productId = asinMatch[1];

    // Generate stable ID from product name if no ASIN
    if (!productId && productName !== 'Unknown') {
      productId = productName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 30);
    }

    return {
      id: productId || 'unknown-' + Date.now(),
      name: productName,
      price: price,
      discount: discount,
      url: href
    };
  }

  // Track a click
  function trackClick(productInfo, source) {
    const data = getData();
    const today = new Date().toISOString().split('T')[0];
    const device = getDeviceType();
    const trafficSource = source || getTrafficSource();

    // Update totals
    data.totalClicks++;

    // Update product stats
    if (!data.products[productInfo.id]) {
      data.products[productInfo.id] = {
        name: productInfo.name,
        price: productInfo.price,
        discount: productInfo.discount,
        firstClick: new Date().toISOString(),
        clicks: 0,
        clickHistory: []
      };
    }
    data.products[productInfo.id].clicks++;
    data.products[productInfo.id].lastClick = new Date().toISOString();
    data.products[productInfo.id].clickHistory.push({
      timestamp: new Date().toISOString(),
      source: trafficSource,
      device: device
    });
    // Keep only last 100 clicks per product
    if (data.products[productInfo.id].clickHistory.length > 100) {
      data.products[productInfo.id].clickHistory.shift();
    }

    // Update daily stats
    if (!data.daily[today]) {
      data.daily[today] = { clicks: 0, products: {} };
    }
    data.daily[today].clicks++;
    if (!data.daily[today].products[productInfo.id]) {
      data.daily[today].products[productInfo.id] = 0;
    }
    data.daily[today].products[productInfo.id]++;

    // Update source stats
    if (!data.sources[trafficSource]) {
      data.sources[trafficSource] = 0;
    }
    data.sources[trafficSource]++;

    // Update device stats
    if (!data.devices[device]) {
      data.devices[device] = 0;
    }
    data.devices[device]++;

    saveData(data);

    console.log('DealTracker: Tracked click', {
      product: productInfo.name,
      source: trafficSource,
      device: device
    });

    return data;
  }

  // Setup automatic tracking on all affiliate links
  function setupAutoTracking() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href*="amzn.to"], a[href*="amazon.com"], a.btn-deal');
      if (link) {
        const productInfo = extractProductInfo(link);
        trackClick(productInfo);
      }
    });
    console.log('DealTracker: Auto-tracking enabled');
  }

  // Get analytics summary
  function getSummary() {
    const data = getData();
    const today = new Date().toISOString().split('T')[0];
    
    // Sort products by clicks
    const topProducts = Object.entries(data.products)
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Get last 7 days
    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last7Days.push({
        date: dateStr,
        clicks: data.daily[dateStr]?.clicks || 0
      });
    }

    return {
      totalClicks: data.totalClicks,
      todayClicks: data.daily[today]?.clicks || 0,
      topProducts: topProducts,
      last7Days: last7Days.reverse(),
      sources: data.sources,
      devices: data.devices,
      firstVisit: data.firstVisit,
      lastUpdated: data.lastUpdated
    };
  }

  // Export full data as JSON
  function exportData() {
    const data = getData();
    return JSON.stringify(data, null, 2);
  }

  // Download data as file
  function downloadData() {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ddf-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clear all data
  function clearData() {
    if (confirm('Are you sure you want to clear all analytics data?')) {
      localStorage.removeItem(STORAGE_KEY);
      console.log('DealTracker: Data cleared');
    }
  }

  // Import data (merge with existing)
  function importData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      const current = getData();
      
      // Merge totals
      current.totalClicks += imported.totalClicks || 0;
      
      // Merge products
      Object.entries(imported.products || {}).forEach(([id, info]) => {
        if (current.products[id]) {
          current.products[id].clicks += info.clicks || 0;
        } else {
          current.products[id] = info;
        }
      });
      
      // Merge daily
      Object.entries(imported.daily || {}).forEach(([date, info]) => {
        if (current.daily[date]) {
          current.daily[date].clicks += info.clicks || 0;
        } else {
          current.daily[date] = info;
        }
      });
      
      // Merge sources
      Object.entries(imported.sources || {}).forEach(([source, count]) => {
        current.sources[source] = (current.sources[source] || 0) + count;
      });
      
      // Merge devices
      Object.entries(imported.devices || {}).forEach(([device, count]) => {
        current.devices[device] = (current.devices[device] || 0) + count;
      });
      
      saveData(current);
      console.log('DealTracker: Data imported successfully');
      return true;
    } catch (e) {
      console.error('DealTracker: Import failed', e);
      return false;
    }
  }

  // Public API
  return {
    init: setupAutoTracking,
    track: trackClick,
    getSummary: getSummary,
    getData: getData,
    exportData: exportData,
    downloadData: downloadData,
    importData: importData,
    clearData: clearData
  };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', DealTracker.init);
} else {
  DealTracker.init();
}
