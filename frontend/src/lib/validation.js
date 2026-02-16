/**
 * Проверка имени сервера: буквы, цифры, дефис, подчёркивание
 */
export function isValidServerName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Проверка хоста: IP-адрес или hostname
 */
export function isValidHostname(host) {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return host.split('.').every(n => Number(n) >= 0 && Number(n) <= 255);
  }
  // hostname
  return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host);
}

/**
 * Проверка порта: 1-65535
 */
export function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}
