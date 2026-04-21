export const PUBLIC_VISIT_PATH_KEY = 'vah_public_visit_path';

export function getStoredPublicVisitPath() {
  try {
    const p = sessionStorage.getItem(PUBLIC_VISIT_PATH_KEY);
    return typeof p === 'string' && /^\/visit\//.test(p) ? p : '';
  } catch {
    return '';
  }
}

export function setStoredPublicVisitPathFromCode(code) {
  const c = String(code || '').trim();
  if (!c) return;
  try {
    sessionStorage.setItem(PUBLIC_VISIT_PATH_KEY, `/visit/${c}`);
  } catch {
    /* ignore */
  }
}

export function clearStoredPublicVisitPath() {
  try {
    sessionStorage.removeItem(PUBLIC_VISIT_PATH_KEY);
  } catch {
    /* ignore */
  }
}
