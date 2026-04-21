export function getCurrentRoute() {
  return {
    path: window.location.pathname,
    query: new URLSearchParams(window.location.search),
  };
}

export function navigateTo(url, options = {}) {
  const { replace = false } = options;
  const nextUrl = new URL(url, window.location.origin);

  if (replace) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }

  window.dispatchEvent(new Event("app:navigate"));
}

export function navigateBack(fallbackUrl = "/") {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  navigateTo(fallbackUrl, { replace: true });
}
