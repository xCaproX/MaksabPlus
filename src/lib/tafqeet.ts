/**
 * دالة التفقيط باللغة العربية للأعداد والمبالغ المالية (الجنيه والقرش)
 */

const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function convertGroup(num: number): string {
  if (num === 0) return '';
  const h = Math.floor(num / 100);
  const rem = num % 100;
  const parts: string[] = [];

  if (h > 0) parts.push(hundreds[h]);

  if (rem > 0) {
    if (rem <= 10) {
      parts.push(units[rem]);
    } else if (rem < 20) {
      parts.push(teens[rem - 10]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      if (u > 0) {
        parts.push(`${units[u]} و${tens[t]}`);
      } else {
        parts.push(tens[t]);
      }
    }
  }
  return parts.join(' و');
}

export function tafqeet(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '';

  const integerPart = Math.floor(n);
  const decimalPart = Math.round((n - integerPart) * 100);

  const billions = Math.floor(integerPart / 1_000_000_000);
  const millions = Math.floor((integerPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000);
  const ones = integerPart % 1_000;

  const words: string[] = [];

  if (billions > 0) {
    if (billions === 1) words.push('مليار');
    else if (billions === 2) words.push('ملياران');
    else if (billions >= 3 && billions <= 10) words.push(`${convertGroup(billions)} مليارات`);
    else words.push(`${convertGroup(billions)} ملياراً`);
  }

  if (millions > 0) {
    if (millions === 1) words.push('مليون');
    else if (millions === 2) words.push('مليونان');
    else if (millions >= 3 && millions <= 10) words.push(`${convertGroup(millions)} ملايين`);
    else words.push(`${convertGroup(millions)} مليوناً`);
  }

  if (thousands > 0) {
    if (thousands === 1) words.push('ألف');
    else if (thousands === 2) words.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) words.push(`${convertGroup(thousands)} آلاف`);
    else words.push(`${convertGroup(thousands)} ألفاً`);
  }

  if (ones > 0) {
    words.push(convertGroup(ones));
  }

  let result = words.join(' و');

  if (integerPart > 0) {
    const lastTwo = integerPart % 100;
    if (integerPart === 1) {
      result = 'جنيه واحد';
    } else if (integerPart === 2) {
      result = 'جنيهان';
    } else if (lastTwo === 0) {
      result = `${result} جنيه`;
    } else if (lastTwo >= 3 && lastTwo <= 10) {
      result = `${result} جنيهات`;
    } else {
      result = `${result} جنيهاً`;
    }
  }

  if (decimalPart > 0) {
    let piasterText = convertGroup(decimalPart);
    if (decimalPart === 1) {
      piasterText = 'قرش واحد';
    } else if (decimalPart === 2) {
      piasterText = 'قرشان';
    } else if (decimalPart >= 3 && decimalPart <= 10) {
      piasterText = `${piasterText} قروش`;
    } else {
      piasterText = `${piasterText} قرشاً`;
    }

    if (integerPart > 0) {
      result = `${result} و${piasterText}`;
    } else {
      result = piasterText;
    }
  }

  return `فقط ${result} لا غير`;
}
