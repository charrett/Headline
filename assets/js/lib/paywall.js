// Paywall functionality for pay-per-article
(function() {
  // API URL - configure via window.PAYWALL_API_URL in code injection
  const API_BASE_URL = window.PAYWALL_API_URL || 'http://localhost:4000/api';
  
  // Check for purchase success on page load
  const urlParams = new URLSearchParams(window.location.search);
  const purchaseSuccess = urlParams.get('purchase');
  
  if (purchaseSuccess === 'success') {
    // Clean URL (remove query parameters)
    const cleanUrl = window.location.pathname;
    history.replaceState({}, '', cleanUrl);
    
    // Check if user is signed in - multiple methods for reliability
    const hasMemberCookie = document.cookie.includes('ghost-members-ssr');
    const buyBtn = document.getElementById('buy-article-btn');
    const hasMemberEmail = buyBtn && buyBtn.dataset.memberEmail;
    const isSignedIn = hasMemberCookie || hasMemberEmail;
    
    console.log('Purchase success - signed in:', isSignedIn);
    
    if (isSignedIn) {
      // User already signed in - just reload to show purchased content
      console.log('Reloading for signed-in user');
      window.location.reload();
    } else {
      // User is anonymous - show message and open signin portal  
      console.log('Opening signin portal for anonymous user');
      showPurchaseSuccessMessage();
      openSigninPortal();
    }
  }
  
  // For free members who purchased this article: check database and hide paywall
  checkArticleAccess();
  
  // Buy article button handler
  const buyBtn = document.getElementById('buy-article-btn');
  if (buyBtn) {
    buyBtn.addEventListener('click', handleBuyArticle);
  }
  
  // Subscribe button handler - prevent default navigation
  const subscribeBtn = document.querySelector('.gh-btn-upgrade[data-portal="signup"]');
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      // Trigger Ghost portal signup
      if (window.GhostMembers) {
        window.GhostMembers.openPortal('signup');
      }
    });
  }
  
  // Sign-in link handler - prevent default navigation
  const signinLinks = document.querySelectorAll('[data-portal="signin"]');
  signinLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      // Trigger Ghost portal signin
      if (window.GhostMembers) {
        window.GhostMembers.openPortal('signin');
      }
    });
  });
  
  async function handleBuyArticle(e) {
    e.preventDefault(); // Prevent default anchor navigation
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    const postTitle = btn.dataset.postTitle;
    const postUrl = btn.dataset.postUrl;
    const memberEmail = btn.dataset.memberEmail; // Will be undefined if not signed in
    const memberName = btn.dataset.memberName; // Will be undefined if not signed in
    
    // Show loading state
    btn.disabled = true;
    const loadingEl = document.getElementById('paywall-loading');
    if (loadingEl) {
      loadingEl.style.display = 'block';
    }
    
    try {
      const requestBody = { postId, postTitle, postUrl };
      
      // If user is signed in, include their email and name for Stripe prefill
      if (memberEmail) {
        requestBody.memberEmail = memberEmail;
        if (memberName) {
          requestBody.memberName = memberName;
        }
      }
      
      const response = await fetch(`${API_BASE_URL}/create-tip-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (data.checkoutUrl) {
        // Redirect to Stripe
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to create checkout. Please try again.');
      btn.disabled = false;
      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
    }
  }
  
  function showPurchaseSuccessMessage() {
    // Create success message overlay for anonymous users
    const overlay = document.createElement('div');
    overlay.className = 'gh-purchase-success-overlay';
    
    const message = document.createElement('div');
    message.className = 'gh-purchase-success-message';
    
    message.innerHTML = `
      <h2>✅ Purchase Complete!</h2>
      <p>Your member account has been created. Please sign in to access this article.</p>
      <p>Opening sign-in portal...</p>
    `;
    
    overlay.appendChild(message);
    document.body.appendChild(overlay);
    
    // Auto-close after portal opens
    setTimeout(() => {
      overlay.remove();
    }, 3000);
  }
  
  function openSigninPortal() {
    // Find existing signin link and click it - Ghost's script handles the rest
    const signinLink = document.querySelector('[data-portal="signin"]');
    
    if (signinLink) {
      console.log('Opening Ghost signin portal...');
      signinLink.click();
    } else {
      console.error('No signin link found - Ghost portal may not be configured');
    }
  }
  
  /**
   * Check if free member has purchased this specific article
   * If yes, hide paywall and show full content
   */
  async function checkArticleAccess() {
    // Only run if there's a paywall visible (meaning user is not a paid subscriber)
    const paywall = document.querySelector('.gh-post-upgrade-cta');
    if (!paywall) {
      return; // No paywall = paid subscriber or public post, nothing to check
    }
    
    // Get member email from buy button (only present if signed in)
    const buyBtn = document.getElementById('buy-article-btn');
    if (!buyBtn) {
      return; // No buy button = something's wrong, bail out
    }
    
    const memberEmail = buyBtn.dataset.memberEmail;
    if (!memberEmail) {
      return; // Not signed in, can't check access
    }
    
    // Get post ID
    const postId = buyBtn.dataset.postId;
    if (!postId) {
      return;
    }
    
    try {
      // Check if this member has access to this article
      // Request full content to be included in response
      const response = await fetch(`${API_BASE_URL}/verify-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId, 
          memberEmail,
          includeContent: true // Request full HTML content
        })
      });
      
      const data = await response.json();
      
      if (data.hasAccess) {
        console.log('✅ Free member has access to this article - showing full content');
        
        // Hide the excerpt and paywall
        const excerptWrapper = document.querySelector('.gh-excerpt-wrapper');
        if (excerptWrapper) {
          excerptWrapper.style.display = 'none';
        }
        paywall.style.display = 'none';
        
        // Show the full content
        const fullContent = document.querySelector('.gh-full-content');
        if (fullContent && data.content) {
          // Sanitize HTML content to prevent XSS attacks
          // DOMPurify removes malicious scripts while keeping safe HTML
          const cleanContent = window.DOMPurify ? 
            window.DOMPurify.sanitize(data.content) : 
            data.content; // Fallback if DOMPurify not loaded
          
          // Inject the sanitized HTML content from API
          fullContent.innerHTML = cleanContent;
          
          // Ensure proper Ghost content classes are applied to child elements
          // Ghost wraps content sections - make sure injected HTML inherits styling
          fullContent.classList.add('gh-content');
          fullContent.style.display = 'block';
          
          console.log('✅ Full article content displayed' + (window.DOMPurify ? ' (sanitized)' : ''));
        } else if (fullContent) {
          // Fallback: show what we have and remove Ghost's paywall
          fullContent.style.display = 'block';
          
          const ghostPaywall = fullContent.querySelector('.gh-post-upgrade-cta');
          if (ghostPaywall) {
            console.log('🗑️ Removing Ghost\'s injected paywall from content');
            ghostPaywall.remove();
          }
          
          console.log('✅ Full article content displayed (fallback)');
        }
      }
    } catch (error) {
      console.error('Error checking article access:', error);
      // Fail gracefully - leave paywall visible on error
    }
  }
})();
