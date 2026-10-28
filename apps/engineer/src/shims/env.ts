// Set at build time (GitHub repository variable API_URL), e.g. https://api.example.com/api/v1
export const API_URL = (import.meta.env.VITE_API_URL as string) || "";
export const APP_URL = "";
export const NODE_ENV = "production";
