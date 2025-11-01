// PPA (Pay-Per-Article) - Secure Token-Based Implementation
// Strategy: Two-step content access flow
// 1. Verify purchase and receive time-limited access token
// 2. Fetch content with token (prevents exposure in network logs)
(function() {
  'use strict';
  
  // DEBUG MODE - Auto-detect or force with ?ppa_debug=true in URL
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG = urlParams.get('ppa_debug') === 'true' || 
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1';
  
  // Debug logger - only logs when DEBUG is true
  const log = (...args) => DEBUG && console.log(...args);
  const logError = (...args) => DEBUG && console.error(...args);
  
  // API URL - auto-detect environment
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000/api'
    : 'https://ppa.fly.dev/api';

  log('🎯 PPA: Script loaded');

  // Wait for DOM to be ready AND give Code Injection scripts time to run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Small delay to ensure Code Injection scripts have executed
      setTimeout(init, 100);
    });
  } else {
    // DOM already loaded, still give a moment for Code Injection
    setTimeout(init, 100);
  }

  function init() {
    log('🎯 PPA: Initialized');
    // FEATURE FLAG - Check if PPA is enabled globally
    // Set window.PPA_ENABLED = true in Ghost Admin > Settings > Code Injection > Site Header
    // to enable PPA feature without redeploying theme
    // OR set window.PPA_ENABLED = 'check-post-id' and window.PPA_TEST_POST_ID to test on one post
    
    let PPA_ENABLED = false;
    
    if (window.PPA_ENABLED === true) {
      PPA_ENABLED = true;
      log('🎯 PPA: Feature enabled globally');
    } else if (window.PPA_ENABLED === 'check-post-id' && window.PPA_TEST_POST_ID) {
      const currentPostId = document.querySelector('article[data-post-id]')?.dataset.postId;
      PPA_ENABLED = (currentPostId === window.PPA_TEST_POST_ID);
      log('🎯 PPA: Checking post ID:', currentPostId, '===', window.PPA_TEST_POST_ID, '?', PPA_ENABLED);
    } else {
      log('🎯 PPA: Feature disabled globally (set window.PPA_ENABLED = true to enable)');
    }
    
    if (!PPA_ENABLED) {
      return; // Exit early if PPA is not enabled
    }
    
    // Handle return from Stripe checkout
    if (window.location.search.includes('purchase=success')) {
      log('🎯 PPA: Purchase successful, reloading to check access');
      history.replaceState({}, '', window.location.pathname);
      window.location.reload();
      return;
    }

    // Find Ghost's native paywall
    const ghostPaywall = document.querySelector('.gh-post-upgrade-cta');
    if (!ghostPaywall) {
      log('🎯 PPA: No paywall found (public post or paid member)');
      return; // No paywall = public post or paid member
    }

    // Get article metadata
    const article = document.querySelector('article[data-post-id]');
    if (!article) {
      log('🎯 PPA: No article metadata found');
      return;
    }

    const memberEmail = article.dataset.memberEmail;

    if (!memberEmail) {
      // Anonymous user - customize Ghost's paywall message
      log('🎯 PPA: Anonymous user - customizing paywall');
      customizeAnonymousPaywall(ghostPaywall);
      return;
    }

    // Free member - check if they purchased this article
    log('🎯 PPA: Free member detected - checking purchase status');
    checkPurchaseAndSwapPaywall(ghostPaywall, article);
  }

  function customizeAnonymousPaywall(paywall) {
    // Update Ghost's paywall to emphasize "sign up free"
    const heading = paywall.querySelector('h2, h3, h4');
    if (heading) {
      heading.textContent = 'This post is for subscribers only';
    }

    const description = paywall.querySelector('p');
    if (description) {
      description.textContent = 'Sign up for a free account to buy individual articles or subscribe for unlimited access.';
    }

    // Update Subscribe button text
    const subscribeBtn = paywall.querySelector('a[data-portal="signup"]');
    if (subscribeBtn && !subscribeBtn.textContent.toLowerCase().includes('free')) {
      subscribeBtn.textContent = 'Sign up free';
    }

    log('🎯 PPA: Anonymous paywall customized');
  }

  async function checkPurchaseAndSwapPaywall(ghostPaywall, article) {
    const postId = article.dataset.postId;
    const memberEmail = article.dataset.memberEmail;

    try {
      // Step 1: Verify access and get token
      log('🎯 PPA: Step 1 - Verifying access');
      const verifyResponse = await fetch(`${API_URL}/verify-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId, 
          memberEmail
        })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyData.hasAccess) {
        log('🎯 PPA: No access - showing buy option');
        showBuyOption(ghostPaywall, article);
        return;
      }

      if (!verifyData.accessToken) {
        logError('🎯 PPA: Access granted but no token received');
        showBuyOption(ghostPaywall, article);
        return;
      }

      log('🎯 PPA: Access verified, token received');

      // Step 2: Fetch content with token
      log('🎯 PPA: Step 2 - Fetching content with token');
      const contentResponse = await fetch(
        `${API_URL}/get-content/${postId}?token=${verifyData.accessToken}`
      );

      if (!contentResponse.ok) {
        const errorData = await contentResponse.json();
        logError('🎯 PPA: Content fetch failed:', errorData);
        
        // Handle specific error cases
        if (contentResponse.status === 403) {
          if (errorData.reason === 'expired') {
            logError('🎯 PPA: Token expired, please refresh');
            alert('Session expired. Please refresh the page.');
          } else if (errorData.reason === 'invalid_signature') {
            logError('🎯 PPA: Invalid token signature');
          }
        } else if (contentResponse.status === 429) {
          logError('🎯 PPA: Rate limit exceeded');
          alert('Too many requests. Please wait a moment and refresh.');
        }
        
        showBuyOption(ghostPaywall, article);
        return;
      }

      const contentData = await contentResponse.json();

      if (contentData.html) {
        log('🎯 PPA: Access granted - removing paywall and showing content');
        
        // Remove the paywall
        ghostPaywall.remove();
        
        // Inject full content
        const contentDiv = document.querySelector('.gh-content');
        if (contentDiv) {
          contentDiv.innerHTML = contentData.html;
          log('🎯 PPA: Full content injected');
        }
      } else {
        logError('🎯 PPA: No content in response');
        showBuyOption(ghostPaywall, article);
      }

    } catch (error) {
      logError('🎯 PPA: Access check failed:', error);
      // On error, fall through to show buy button
      showBuyOption(ghostPaywall, article);
    }
  }

  function showBuyOption(ghostPaywall, article) {
    log('🎯 PPA: Replacing Ghost paywall with buy option');
    
    // Replace Ghost's paywall content
    ghostPaywall.innerHTML = `
      <div class="gh-post-upgrade-cta-content">
        <h2>This post is for paid subscribers only</h2>
        <p>Buy this article for $5 or upgrade to a paid subscription for unlimited access.</p>
        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; flex-wrap: wrap;">
          <a href="#" 
             class="gh-btn gh-btn-primary ppa-buy-btn"
             data-post-id="${article.dataset.postId}"
             data-post-title="${article.dataset.postTitle}"
             data-post-url="${article.dataset.postUrl}"
             data-member-email="${article.dataset.memberEmail}"
             ${article.dataset.memberName ? `data-member-name="${article.dataset.memberName}"` : ''}>
            Buy this article for $5
          </a>
          <a href="#/portal/signup" 
             class="gh-btn"
             data-portal="signup">
            Upgrade to subscription
          </a>
        </div>
      </div>
    `;

    // Attach buy button handler
    const buyBtn = ghostPaywall.querySelector('.ppa-buy-btn');
    if (buyBtn) {
      buyBtn.addEventListener('click', handleBuyClick);
    }
  }

  async function handleBuyClick(e) {
    e.preventDefault();
    const btn = e.currentTarget;

    log('🎯 PPA: Buy button clicked');
    
    btn.disabled = true;
    btn.textContent = 'Loading...';

    try {
      const response = await fetch(`${API_URL}/create-tip-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: btn.dataset.postId,
          postTitle: btn.dataset.postTitle,
          postUrl: btn.dataset.postUrl,
          memberEmail: btn.dataset.memberEmail,
          memberName: btn.dataset.memberName || ''
        })
      });

      const data = await response.json();
      log('🎯 PPA: API response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'API request failed');
      }

      if (data.checkoutUrl) {
        log('🎯 PPA: Redirecting to Stripe checkout');
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      logError('🎯 PPA: Checkout creation failed:', error);
      alert('Failed to create checkout. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Buy this article for $5';
    }
  }
})();
