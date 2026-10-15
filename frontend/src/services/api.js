
import axios from "axios";

// =========================================================
// API CONFIGURATION
// =========================================================

const API_BASE_URL = (
  import.meta.env.VITE_API_URL?.trim() ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =========================================================
// REQUEST INTERCEPTOR
// Automatically attach JWT authentication token
// =========================================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("respicare_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// =========================================================
// RESPONSE INTERCEPTOR
// Report backend validation errors
// =========================================================

api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (error.response) {
      const status = error.response.status;

      if (status === 422) {
        console.error(
          "RespiCare API validation error (422):",
          {
            endpoint: error.config?.url,
            details: error.response.data?.detail,
          }
        );
      } else {
        console.error(
          `RespiCare API error (${status}):`,
          error.response.data
        );
      }
    } else if (error.request) {
      console.error(
        "Cannot connect to RespiCare backend:",
        error.message
      );
    }

    return Promise.reject(error);
  }
);

// =========================================================
// EXPORT
// =========================================================

export default api;
