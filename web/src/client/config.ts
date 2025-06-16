// Configuration for the client
export const config = {
  // Use TypeScript server for all API calls and WebSocket
  apiBaseUrl: `http://${window.location.hostname}:3000`,
  wsBaseUrl: `ws://${window.location.hostname}:3000`
};

// Helper function to build API URLs
export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}