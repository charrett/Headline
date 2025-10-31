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
    
    // Check if user is signed in by looking for member cookie
    const isSignedIn = document.cookie.includes('ghost-members-ssr');
    
    // Show success message
    showPurchaseSuccessMessage(isSignedIn);
    
    // Only open signin portal if user is NOT already signed in
    if (!isSignedIn) {
      openSigninPortal();
    }
  }
  
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
  
  function showPurchaseSuccessMessage(isSignedIn) {
    // Create success message overlay using CSS classes
    const overlay = document.createElement('div');
    overlay.className = 'gh-purchase-success-overlay';
    
    const message = document.createElement('div');
    message.className = 'gh-purchase-success-message';
    
    if (isSignedIn) {
      // User is already signed in - just needs to reload to see content
      message.innerHTML = `
        <h2>✅ Purchase Complete!</h2>
        <p>Thank you for your purchase! You now have access to this article.</p>
        <button class="gh-btn gh-primary-btn" onclick="window.location.reload()">View Article</button>
      `;
      
      // Auto-reload after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } else {
      // User is anonymous - needs to sign in
      message.innerHTML = `
        <h2>✅ Purchase Complete!</h2>
        <p>Your member account has been created. Please sign in to access this article.</p>
        <p>Opening sign-in portal...</p>
      `;
      
      // Auto-close after portal opens
      setTimeout(() => {
        overlay.remove();
      }, 3000);
    }
    
    overlay.appendChild(message);
    document.body.appendChild(overlay);
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
})();
