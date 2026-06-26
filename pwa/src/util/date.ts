export const localDayStartMillis = (millis: number): number => {
  const date = new Date(millis);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const formatDate = (millis: number, locale: string = 'de-DE'): string => {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  }).format(new Date(millis));
};

export const formatTime = (millis: number, locale: string = 'de-DE'): string => {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis));
};
