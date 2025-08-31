/**
 * Normalize an object by removing unnecessary data
 *
 *
 * @param removeKeyPaths - The key paths to remove
 * @param obj - The object to normalize
 * @returns The normalized object
 */
const normalizeObject = (removeKeyPaths: string[], obj: Record<string, unknown>): Record<string, unknown> => {
  // Create a deep copy to avoid mutating the original
  const normalizedObj = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

  // Helper function to check if value is a non-null object
  const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  // Remove each specified key path
  removeKeyPaths.forEach(keyPath => {
    const keys = keyPath.split('.');
    let current: Record<string, unknown> = normalizedObj;

    // Navigate to the parent of the key to be removed
    for (let i = 0; i < keys.length - 1; i++) {
      const nextValue = current[keys[i]];
      if (isObject(nextValue)) {
        current = nextValue;
      } else {
        // Path doesn't exist, skip this key path
        return;
      }
    }

    // Remove the final key if it exists
    const finalKey = keys[keys.length - 1];
    if (finalKey in current) {
      delete current[finalKey];
    }
  });

  return normalizedObj;
};

/**
 * Remove null, undefined, empty strings, empty arrays, and empty objects from an object
 * Recursively removes all null, undefined, and empty values from an object
 *
 * @param obj - The object to remove null and empty values from
 * @returns The object with null and empty values removed
 */
const removeNullOrEmpty = (obj: unknown): unknown => {
  // Return primitive values as-is (except null/undefined)
  if (typeof obj !== 'object' || obj === null || obj === undefined) {
    return obj === null || obj === undefined ? undefined : obj;
  }

  if (Array.isArray(obj)) {
    // Recursively clean array items and filter out null/undefined results
    const cleanedArray = obj.map(item => removeNullOrEmpty(item)).filter(item => item !== null && item !== undefined);

    // Return undefined for empty arrays, otherwise return the cleaned array
    return cleanedArray.length === 0 ? undefined : cleanedArray;
  }

  // Handle objects
  const cleanedEntries = Object.entries(obj as Record<string, unknown>)
    .map(([key, value]) => {
      const cleanedValue = removeNullOrEmpty(value);
      return [key, cleanedValue] as [string, unknown];
    })
    .filter(([_, value]) => {
      // Filter out null, undefined, empty strings, and empty arrays/objects
      if (value === null || value === undefined || value === '') {
        return false;
      }

      // Filter out empty arrays
      if (Array.isArray(value) && value.length === 0) {
        return false;
      }

      // Filter out empty objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
        return false;
      }

      return true;
    });

  const cleanedObject = Object.fromEntries(cleanedEntries);

  // Return undefined for empty objects, otherwise return the cleaned object
  return Object.keys(cleanedObject).length === 0 ? undefined : cleanedObject;
};

export { removeNullOrEmpty, normalizeObject };
