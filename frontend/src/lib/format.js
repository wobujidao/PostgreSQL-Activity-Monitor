/**
 * Форматирование байтов в человекочитаемый вид (Б, КБ, МБ, ГБ, ТБ)
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Форматирование байтов только в ГБ
 */
export function formatBytesGB(bytes) {
  if (!bytes || bytes === 0) return '0.00 ГБ';
  return `${(bytes / 1073741824).toFixed(2)} ГБ`;
}

/**
 * Форматирование uptime из часов в "X д. Y ч. Z мин."
 */
export function formatUptime(hours) {
  if (!hours && hours !== 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / 1440);
  const hoursLeft = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  if (hoursLeft > 0) return `${hoursLeft} ч. ${minutes} мин.`;
  return `${minutes} мин.`;
}

/**
 * Форматирование ISO timestamp в локальную дату-время
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('ru-RU');
}

/**
 * Форматирование ISO строки в дату (без времени)
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

/**
 * Форматирование секунд в MM:SS (для таймера сессии)
 */
export function formatTimeLeft(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
