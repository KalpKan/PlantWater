// Where the API lives. Empty means "same origin" (/api/... on this host),
// which is how the Vercel deployment works. Set REACT_APP_API_URL only when
// the API is hosted somewhere else. In local dev the CRA proxy (package.json)
// forwards /api to the local backend on port 3001.
export const API_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

const config = { API_URL, apiUrl };
export default config;
