// PPA (Pay-Per-Article) - Secure Token-Based Implementation
// Strategy: Two-step content access flow
// 1. Verify purchase and receive time-limited access token
// 2. Fetch content with token (prevents exposure in network logs)
(function() {
  'use strict';
  
  // API URL - auto-detect environment
  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000/api'
    : 'https://ppa.fly.dev/api';

  console.log('🎯 PPA: Initialized');

  // Initialize on page load
  init();

  function init() {
    // Handle return from Stripe checkout
    if (window.location.search.includes('purchase=success')) {
      console.log('🎯 PPA: Purchase successful, reloading to check access');
      history.replaceState({}, '', window.location.pathname);
      window.location.reload();
      return;
    }

    // Find Ghost's native paywall
    const ghostPaywall = document.querySelector('.gh-post-upgrade-cta');
    if (!ghostPaywall) {
      console.log('🎯 PPA: No paywall found (public post or paid member)');
      return; // No paywall = public post or paid member
    }

    // Get article metadata
    const article = document.querySelector('article[data-post-id]');
    if (!article) {
      console.log('🎯 PPA: No article metadata found');
      return;
    }

    const memberEmail = article.dataset.memberEmail;

    if (!memberEmail) {
      // Anonymous user - customize Ghost's paywall message
      console.log('🎯 PPA: Anonymous user - customizing paywall');
      customizeAnonymousPaywall(ghostPaywall);
      return;
    }

    // Free member - check if they purchased this article
    console.log('🎯 PPA: Free member detected - checking purchase status');
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

    console.log('🎯 PPA: Anonymous paywall customized');
  }

  async function checkPurchaseAndSwapPaywall(ghostPaywall, article) {
    const postId = article.dataset.postId;
    const memberEmail = article.dataset.memberEmail;

    try {
      // Step 1: Verify access and get token
      console.log('🎯 PPA: Step 1 - Verifying access');
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
        console.log('🎯 PPA: No access - showing buy option');
        showBuyOption(ghostPaywall, article);
        return;
      }

      if (!verifyData.accessToken) {
        console.error('🎯 PPA: Access granted but no token received');
        showBuyOption(ghostPaywall, article);
        return;
      }

      console.log('🎯 PPA: Access verified, token received');

      // Step 2: Fetch content with token
      console.log('🎯 PPA: Step 2 - Fetching content with token');
      const contentResponse = await fetch(
        `${API_URL}/get-content/${postId}?token=${verifyData.accessToken}`
      );

      if (!contentResponse.ok) {
        const errorData = await contentResponse.json();
        console.error('🎯 PPA: Content fetch failed:', errorData);
        
        // Handle specific error cases
        if (contentResponse.status === 403) {
          if (errorData.reason === 'expired') {
            console.error('🎯 PPA: Token expired, please refresh');
            alert('Session expired. Please refresh the page.');
          } else if (errorData.reason === 'invalid_signature') {
            console.error('🎯 PPA: Invalid token signature');
          }
        } else if (contentResponse.status === 429) {
          console.error('🎯 PPA: Rate limit exceeded');
          alert('Too many requests. Please wait a moment and refresh.');
        }
        
        showBuyOption(ghostPaywall, article);
        return;
      }

      const contentData = await contentResponse.json();

      if (contentData.html) {
        console.log('🎯 PPA: Access granted - removing paywall and showing content');
        
        // Remove the paywall
        ghostPaywall.remove();
        
        // Inject full content
        const contentDiv = document.querySelector('.gh-content');
        if (contentDiv) {
          contentDiv.innerHTML = contentData.html;
          console.log('🎯 PPA: Full content injected');
        }
      } else {
        console.error('🎯 PPA: No content in response');
        showBuyOption(ghostPaywall, article);
      }

    } catch (error) {
      console.error('🎯 PPA: Access check failed:', error);
      // On error, fall through to show buy button
      showBuyOption(ghostPaywall, article);
    }
  }

  function showBuyOption(ghostPaywall, article) {
    console.log('🎯 PPA: Replacing Ghost paywall with buy option');
    
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

    console.log('🎯 PPA: Buy button clicked');
    
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
      console.log('🎯 PPA: API response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'API request failed');
      }

      if (data.checkoutUrl) {
        console.log('🎯 PPA: Redirecting to Stripe checkout');
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('🎯 PPA: Checkout creation failed:', error);
      alert('Failed to create checkout. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Buy this article for $5';
    }
  }
})();
