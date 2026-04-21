import {getCanonicalHostname} from './hostname';

describe('getCanonicalHostname', () => {
  it('strips a leading www.', () => {
    expect(getCanonicalHostname('www.example.com')).toBe('example.com');
  });

  it('leaves a hostname without www. alone', () => {
    expect(getCanonicalHostname('example.com')).toBe('example.com');
  });

  it('leaves a hostname whose subdomain is not www alone', () => {
    expect(getCanonicalHostname('m.example.com')).toBe('m.example.com');
  });

  it('only strips the leading www., not an embedded one', () => {
    // A domain like `foo.www.example.com` should keep the `www.`
    // because it is not the first label.
    expect(getCanonicalHostname('foo.www.example.com')).toBe(
      'foo.www.example.com'
    );
  });

  it('handles a hostname that is exactly "www." (edge case, not a real host)', () => {
    // Degenerate input. Return what remains.
    expect(getCanonicalHostname('www.')).toBe('');
  });

  it('does not lowercase the input', () => {
    // The function is a prefix-strip, not a normalizer. Case is
    // preserved so the caller can decide.
    expect(getCanonicalHostname('WWW.example.com')).toBe('WWW.example.com');
  });

  it('returns an empty string for empty input', () => {
    expect(getCanonicalHostname('')).toBe('');
  });

  it('treats www as a prefix match, not a regex', () => {
    // `wwwx.example.com` should not be touched - startsWith('www.')
    // requires the literal 4 chars `w`, `w`, `w`, `.`.
    expect(getCanonicalHostname('wwwx.example.com')).toBe('wwwx.example.com');
  });
});
