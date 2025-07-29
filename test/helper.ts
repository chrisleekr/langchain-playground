// Custom asymmetric matcher for string or null
export const stringOrNull = {
  asymmetricMatch: (val: unknown): val is string | null => typeof val === 'string' || val === null,
  toString: () => 'stringOrNull',
  // optional: include toAsymmetricMatcher to play nicely with Jest prints:
  toAsymmetricMatcher: () => 'stringOrNull'
};

export const numberOrNull = {
  asymmetricMatch: (val: unknown): val is number | null => typeof val === 'number' || val === null,
  toString: () => 'numberOrNull',
  toAsymmetricMatcher: () => 'numberOrNull'
};
