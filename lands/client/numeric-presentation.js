const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const latinDigits = (value) => String(value ?? '').replace(/[٠-٩۰-۹]/g, (digit) => {
  const arabic = ARABIC_DIGITS.indexOf(digit); return arabic >= 0 ? String(arabic) : String(PERSIAN_DIGITS.indexOf(digit));
});
const integer = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
export const formatInteger = (value) => integer.format(Number(value));
export const formatNumber = (value) => decimal.format(Number(value));
export const formatPercent = (value) => `${formatInteger(value)}%`;
export const formatDate = (value) => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const formatIdentifier = (value) => latinDigits(value);
