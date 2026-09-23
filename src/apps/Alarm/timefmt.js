// Territory_ConvertDateAndTime format strings (%Z12:%MI %AM, %W3, %ZDY%ST, %MO, %CE%YR, ...)
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n) => String(n).padStart(2, '0');
export function ordinal(n) {
  const t = n % 100;
  return t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
/** Format a Date with a Territory format string. Unknown codes are left as they are. */
export function formatTime(fmt, d) {
  return fmt.replace(/%(z?)([a-z0-9]{2})/gi, (all, z, code) => {
    const c = code.toUpperCase();
    const sup = !!z;
    const num = (n) => (sup ? String(n) : two(n));
    const h = d.getHours();
    switch (c) {
      case 'CS': return num(Math.floor(d.getMilliseconds() / 10));
      case 'SE': return num(d.getSeconds());
      case 'MI': return num(d.getMinutes());
      case '12': return num(h % 12 === 0 ? 12 : h % 12);
      case '24': return num(h);
      case 'AM': case 'PM': return h < 12 ? 'am' : 'pm';
      case 'WE': return DAYS[d.getDay()];
      case 'W3': return DAYS[d.getDay()].slice(0, 3);
      case 'WN': return String(d.getDay() + 1);
      case 'DY': return num(d.getDate());
      case 'ST': return ordinal(d.getDate());
      case 'MO': return MONTHS[d.getMonth()];
      case 'M3': return MONTHS[d.getMonth()].slice(0, 3);
      case 'MN': return num(d.getMonth() + 1);
      case 'CE': return num(Math.floor(d.getFullYear() / 100));
      case 'YR': return two(d.getFullYear() % 100);
      case 'TZ': return /GMT|BST/.test(String(d)) ? 'BST' : 'GMT';
      default: return all;
    }
  });
}
