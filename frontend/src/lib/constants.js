// API
export const API_BASE_URL = 'https://pam.cbmo.mosreg.ru';

// Session & Token
export const SESSION_WARNING_SEC = 300; // 5 минут до истечения — показать modal
export const SESSION_WARNING_MS = SESSION_WARNING_SEC * 1000;
export const TOKEN_CHECK_INTERVAL = 1000; // 1 сек — обновление таймера

// Data refresh
export const BACKEND_CHECK_INTERVAL = 5000; // 5 сек
export const SERVERS_REFRESH_INTERVAL = 60000; // 1 минута
export const DB_STATS_REFRESH_INTERVAL = 60000; // 1 минута
export const FETCH_DEBOUNCE_MS = 500;

// Date range
export const DEFAULT_DATE_RANGE_DAYS = 7;

// Pagination
export const ITEMS_PER_PAGE = 20;

// Database analysis criteria defaults
export const DEFAULT_CRITERIA = {
  deadDays: 30,
  staticConnectionsDays: 30,
  lowActivityThreshold: 2,
};

// SSH defaults
export const DEFAULT_SSH_PORT = 22;
export const DEFAULT_PG_PORT = 5432;
export const DEFAULT_SSH_AUTH_TYPE = 'password';
export const DEFAULT_KEY_TYPE = 'rsa';
export const DEFAULT_KEY_SIZE = '2048';

// localStorage keys
export const LS_TOKEN = 'token';
export const LS_USERNAME = 'username';
export const LS_USER_ROLE = 'userRole';
export const LS_CRITERIA = 'dbAnalysisCriteria';
