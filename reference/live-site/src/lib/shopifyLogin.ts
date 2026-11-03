const SHOPIFY_LOGIN_URL = 'https://shopify.com/4283367495/account';

/**
 * Opens Shopify Customer Account login in a popup window.
 * Polls for when the popup closes, then calls the onComplete callback
 * so the calling code can refresh auth state or redirect.
 */
export function openShopifyLogin(onComplete?: () => void) {
  const popup = window.open(
    SHOPIFY_LOGIN_URL,
    'shopify-login',
    'width=500,height=650,left=200,top=100,toolbar=no,menubar=no'
  );

  if (!popup) {
    // Popup blocked — fall back to redirect
    window.location.href = SHOPIFY_LOGIN_URL;
    return;
  }

  const timer = setInterval(() => {
    if (popup.closed) {
      clearInterval(timer);
      onComplete?.();
    }
  }, 500);
}
