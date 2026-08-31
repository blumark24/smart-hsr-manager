(() => {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const toLatinDigits = value => String(value ?? '').replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)));
  const asNumber = value => Number(toLatinDigits(value));

  const format = Object.freeze({
    latin: toLatinDigits,
    integer(value) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)
        : '—';
    },
    decimal(value, maximumFractionDigits = 1) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number)
        : '—';
    },
    percent(value) {
      const number = asNumber(value);
      return Number.isFinite(number) ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)}%` : '—';
    },
    date(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
        : 'غير متاح';
    },
    time(value = Date.now()) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
        : '—';
    },
    dateTime(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : 'غير متاح';
    }
  });

  window.SmartHSRFormat = format;
})();
