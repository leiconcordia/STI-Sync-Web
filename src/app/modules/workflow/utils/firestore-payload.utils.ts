/**
 * Pure Firestore payload sanitization & array normalization helpers.
 * Zero Firebase runtime imports so both browser code and Node tests can import directly.
 */

function isFieldValueLike(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  return (
    '_methodName' in val ||
    val.constructor?.name === 'FieldValue' ||
    val.constructor?.name?.endsWith('FieldValueImpl')
  );
}

function isTimestampOrGeoLike(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  if (val instanceof Date) return true;
  if (typeof val.toDate === 'function') return true;
  if (
    typeof val.isEqual === 'function' &&
    typeof val.latitude === 'number' &&
    typeof val.longitude === 'number'
  ) {
    return true;
  }
  return false;
}

function isUnsupportedBinaryOrDom(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  if (typeof File !== 'undefined' && val instanceof File) return true;
  if (typeof Blob !== 'undefined' && val instanceof Blob) return true;
  if (typeof Element !== 'undefined' && val instanceof Element) return true;
  if (typeof val.then === 'function') return true;
  return false;
}

function sanitizeArrayElements(arr: any[]): any[] {
  const out: any[] = [];
  for (let i = 0; i < arr.length; i++) {
    // Handles sparse arrays safely too (arr[i] === undefined)
    const item = arr[i];
    if (
      item === undefined ||
      typeof item === 'function' ||
      typeof item === 'symbol'
    ) {
      continue;
    }
    if (Array.isArray(item)) {
      // Firestore strictly forbids nested arrays directly inside arrays ("Property array contains an invalid nested entity.")
      out.push(...sanitizeArrayElements(item));
      continue;
    }
    if (isFieldValueLike(item)) {
      if ((item as any)._methodName === 'serverTimestamp') {
        out.push(new Date().toISOString());
      }
      // deleteField / arrayUnion / arrayRemove inside an array are invalid in Firestore; strip them.
      continue;
    }
    if (isUnsupportedBinaryOrDom(item)) {
      continue;
    }
    const clean = sanitizeInternal(item, true);
    if (clean !== undefined) {
      out.push(clean);
    }
  }
  return out;
}

function sanitizeInternal<T>(data: T, insideArray: boolean): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (typeof data === 'function' || typeof data === 'symbol') {
    return undefined as any;
  }
  if (typeof data === 'number') {
    return (Number.isFinite(data) ? data : 0) as any;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return sanitizeArrayElements(data) as any;
  }
  if (isFieldValueLike(data)) {
    if (insideArray) {
      return ((data as any)._methodName === 'serverTimestamp'
        ? new Date().toISOString()
        : undefined) as any;
    }
    return data;
  }
  if (isTimestampOrGeoLike(data)) {
    return data;
  }
  if (isUnsupportedBinaryOrDom(data)) {
    return undefined as any;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol'
    ) {
      continue;
    }
    const sanitized = sanitizeInternal(value, insideArray);
    if (sanitized !== undefined) {
      cleanObj[key] = sanitized;
    }
  }
  return cleanObj as T;
}

/**
 * Recursively strips undefined values, sparse array holes, nested arrays-in-arrays,
 * FieldValues inside arrays, NaN/Infinity, and non-serializable objects (File/Blob/functions)
 * while preserving top-level / map Firestore FieldValues (serverTimestamp, arrayUnion, deleteField),
 * Timestamps, and Dates.
 */
export function sanitizeFirestorePayload<T>(data: T): T {
  return sanitizeInternal(data, false);
}

/**
 * Normalizes array-like proposal/report fields (which might contain strings, nested arrays,
 * objects with title/name/text/description, or undefined entries) into a flat string[].
 */
export function normalizeFlatStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof value === 'object') {
      const candidate =
        (value as any).text ||
        (value as any).title ||
        (value as any).name ||
        (value as any).description ||
        (value as any).label;
      return candidate ? [String(candidate).trim()].filter(Boolean) : [];
    }
    return [String(value).trim()].filter(Boolean);
  }

  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (item === null || item === undefined) continue;
    if (Array.isArray(item)) {
      out.push(...normalizeFlatStringArray(item));
    } else if (typeof item === 'object') {
      const candidate =
        (item as any).text ||
        (item as any).title ||
        (item as any).name ||
        (item as any).description ||
        (item as any).label ||
        (item as any).value;
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        out.push(String(candidate).trim());
      }
    } else {
      const str = String(item).trim();
      if (str) out.push(str);
    }
  }
  return out;
}
