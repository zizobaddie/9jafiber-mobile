// The app keeps the login on the phone (no cookies across app restarts).
export const TOKEN_KEY = "field:token";
const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || undefined; } catch { return undefined; } })();
export default token;
