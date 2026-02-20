/**
 * DailyDealFeed Click Tracking
 * Lightweight, privacy-conscious analytics
 * 
 * This script tracks:
 * - Page views (on load)
 * - Amazon link clicks (on click)
 * - Session duration (time to click)
 * 
 * No cookies, no PII, no external services required.
 * Data stored locally via localStorage fallback.
 */
(function() {
  'use strict';
  
  // Extract product ID from URL
  var match = location.pathname.match(/product-(\d+)/);
  var productId = match ? match[1] : null;
  if (!productId) return;
  
  // Generate session ID (page session only, not persistent)
  var sessionId = Math.random().toString(36).slice(2, 10);
  var pageLoadTime = Date.now();
  
  // Get referrer domain only (privacy)
  var referrer = '';
  try {
    if (document.referrer) {
      referrer = new URL(document.referrer).hostname.replace(/^www\./, '');
    }
  } catch (e) {}
  
  // Detect device type
  var device = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'm' : 'd';
  
  // Local storage key
  var STORAGE_KEY = 'ddf_analytics';
  
  // Store event locally (fallback when no endpoint)
  function storeLocally(event) {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      stored.push(event);
      // Keep only last 1000 events
      if (stored.length > 1000) stored = stored.slice(-1000);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {}
  }
  
  // Track event
  function track(eventType, extra) {
    var event = {
      e: eventType,
      p: productId,
      s: sessionId,
      t: Date.now(),
      r: referrer,
      d: device
    };
    if (extra) {
      for (var k in extra) event[k] = extra[k];
    }
    
    // Store locally (always works, no CORS issues)
    storeLocally(event);
    
    // Optional: Send to tracking endpoint if configured
    // Uncomment and configure TRACK_URL for server-side collection
    /*
    var TRACK_URL = 'https://your-endpoint.com/track';
    if (TRACK_URL) {
      var img = new Image();
      img.src = TRACK_URL + '?' + new URLSearchParams(event).toString();
    }
    */
    
    // Console log in development
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('[DDF Analytics]', eventType, event);
    }
  }
  
  // Track page view on load
  track('view');
  
  // Track clicks on Amazon buttons
  var buyButtons = document.querySelectorAll('.buy-btn, a[href*="amazon.com"]');
  for (var i = 0; i < buyButtons.length; i++) {
    buyButtons[i].addEventListener('click', function(e) {
      var duration = Math.round((Date.now() - pageLoadTime) / 1000);
      track('click', { duration: duration });
    });
  }
  
  // Export for debugging
  window.ddfAnalytics = {
    getEvents: function() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      } catch (e) { return []; }
    },
    clearEvents: function() {
      localStorage.removeItem(STORAGE_KEY);
    },
    exportCSV: function() {
      var events = this.getEvents();
      var csv = 'timestamp,event,product,session,referrer,device,duration\n';
      events.forEach(function(e) {
        csv += [
          new Date(e.t).toISOString(),
          e.e,
          e.p,
          e.s,
          e.r || '',
          e.d,
          e.duration || ''
        ].join(',') + '\n';
      });
      return csv;
    }
  };
})();
