/* ============================================================================
 * Portal configuration.
 * ----------------------------------------------------------------------------
 * apiBase: set this to the IAM backend's API base URL to use the REAL service.
 *          Leave it "" (empty) to use the in-browser localStorage MOCK (demo).
 *
 *   Mock (default):   apiBase: ""
 *   Live backend:     apiBase: "http://localhost:5100/api/v1"
 *
 * When live, the portal calls the backend with cookies (credentials: include),
 * so make sure the backend's CORS_ORIGINS includes this portal's origin.
 * ==========================================================================*/
window.IAM_CONFIG = {
  apiBase: ""
};
