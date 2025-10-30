// Paywall functionality for pay-per-article
(function() {
  // API URL - configure via window.PAYWALL_API_URL in code injection
  const API_BASE_URL = window.PAYWALL_API_URL || 'http://localhost:4000/api';
  
  // Check for purchase success on page load
  const urlParams = new URLSearchParams(window.location.search);
  const purchaseSuccess = urlParams.get('purchase');
  const sessionId = urlParams.get('session_id');
  
  if (purchaseSuccess === 'success' && sessionId) {
    // Get email from session and show success message
    getSessionEmailAndShowMessage(sessionId);
    
    // Clean URL (remove query parameters)
    const cleanUrl = window.location.pathname;
    history.replaceState({}, '', cleanUrl);
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
  
  async function getSessionEmailAndShowMessage(sessionId) {
    try {
      const response = await fetch(`${API_BASE_URL}/checkout-session/${sessionId}`);
      const data = await response.json();
      
      if (data.email) {
        showPurchaseSuccessMessage(data.email);
      } else {
        showPurchaseSuccessMessage();
      }
    } catch (error) {
      console.error('Error fetching session email:', error);
      showPurchaseSuccessMessage();
    }
  }
  
  async function handleBuyArticle(e) {
    e.preventDefault(); // Prevent default anchor navigation
    const btn = e.currentTarget;
    const postId = btn.dataset.postId;
    const postTitle = btn.dataset.postTitle;
    const postUrl = btn.dataset.postUrl;
    
    // Show loading state
    btn.disabled = true;
    const loadingEl = document.getElementById('paywall-loading');
    if (loadingEl) {
      loadingEl.style.display = 'block';
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/create-tip-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, postTitle, postUrl })
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
  
  function showPurchaseSuccessMessage(email) {
    // Create and show success message overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;';
    
    const message = document.createElement('div');
    message.style.cssText = 'background: white; padding: 40px; border-radius: 8px; max-width: 500px; text-align: center;';
    
    const emailText = email ? 
      `Your purchase is complete! Sign in with <strong>${email}</strong> to access this article.` : 
      `Your purchase is complete! Sign in to access this article.`;
    
    message.innerHTML = `
      <h2 style="margin: 0 0 16px; font-size: 2.4rem; color: #15171A;">✅ Purchase Complete!</h2>
      <p style="margin: 0 0 24px; font-size: 1.6rem; line-height: 1.5; color: #738a94;">
        ${emailText}
      </p>
      <button 
        id="success-signin-btn"
        style="background: var(--ghost-accent-color); color: white; border: none; padding: 12px 24px; font-size: 1.6rem; font-weight: 600; border-radius: 6px; cursor: pointer; margin-right: 12px;"
      >
        Sign In Now
      </button>
      <button 
        onclick="this.parentElement.parentElement.remove()"
        style="background: transparent; color: #738a94; border: 1px solid #e1e8ed; padding: 12px 24px; font-size: 1.6rem; font-weight: 600; border-radius: 6px; cursor: pointer;"
      >
        Close
      </button>
    `;
    
    overlay.appendChild(message);
    document.body.appendChild(overlay);
    
    // Add sign-in button handler
    const signinBtn = overlay.querySelector('#success-signin-btn');
    if (signinBtn) {
      signinBtn.addEventListener('click', function() {
        overlay.remove();
        openSigninPortal();
      });
    }
  }
  
  function openSigninPortal() {
    console.log('openSigninPortal called');
    const tryOpen = () => {
      console.log('Checking for GhostMembers:', !!window.GhostMembers);
      if (window.GhostMembers) {
        console.log('Opening Ghost portal...');
        window.GhostMembers.openPortal('signin');
        // Reload page after successful sign-in to show purchased content
        window.addEventListener('message', function(event) {
          console.log('Received message:', event.data);
          if (event.data && event.data.type === 'member-signin-success') {
            console.log('Sign-in successful, reloading...');
            window.location.reload();
          }
        });
      } else {
        // Ghost Members not loaded yet, wait 100ms and retry
        console.log('Ghost Members not available yet, retrying in 100ms...');
        setTimeout(tryOpen, 100);
      }
    };
    tryOpen();
  }
})();
