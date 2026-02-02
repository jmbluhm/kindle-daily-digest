import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, computeContentHash } from './index.js';

describe('canonicalizeUrl', () => {
  it('removes common tracking parameters', () => {
    const url =
      'https://example.com/article?utm_source=twitter&utm_medium=social&id=123';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/article?id=123');
  });

  it('removes www prefix', () => {
    const url = 'https://www.example.com/article';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/article');
  });

  it('normalizes protocol to https', () => {
    const url = 'http://example.com/article';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/article');
  });

  it('removes trailing slash', () => {
    const url = 'https://example.com/article/';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/article');
  });

  it('preserves path without trailing slash', () => {
    const url = 'https://example.com/article';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/article');
  });

  it('lowercases hostname', () => {
    const url = 'https://EXAMPLE.COM/Article';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/Article');
  });

  it('handles multiple tracking params', () => {
    const url =
      'https://www.example.com/post?fbclid=abc&gclid=def&ref=homepage&page=1';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/post?page=1');
  });

  it('returns original on invalid URL', () => {
    const url = 'not-a-valid-url';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe(url);
  });

  it('handles URLs with no query string', () => {
    const url = 'https://www.example.com/path/to/article';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/path/to/article');
  });

  it('preserves root path', () => {
    const url = 'https://example.com/';
    const canonical = canonicalizeUrl(url);
    expect(canonical).toBe('https://example.com/');
  });
});

describe('computeContentHash', () => {
  it('produces consistent hash for same content', () => {
    const content = 'This is some article content.';
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', () => {
    const hash1 = computeContentHash('Content A');
    const hash2 = computeContentHash('Content B');
    expect(hash1).not.toBe(hash2);
  });

  it('normalizes whitespace', () => {
    const hash1 = computeContentHash('Hello   World');
    const hash2 = computeContentHash('Hello World');
    expect(hash1).toBe(hash2);
  });

  it('normalizes case', () => {
    const hash1 = computeContentHash('Hello World');
    const hash2 = computeContentHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('trims leading and trailing whitespace', () => {
    const hash1 = computeContentHash('  Hello World  ');
    const hash2 = computeContentHash('Hello World');
    expect(hash1).toBe(hash2);
  });

  it('handles empty string', () => {
    const hash = computeContentHash('');
    expect(hash).toHaveLength(32);
  });

  it('produces 32-character hex string', () => {
    const hash = computeContentHash('Test content');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('handles very long content by truncating', () => {
    const longContent = 'x'.repeat(10000);
    const hash = computeContentHash(longContent);
    expect(hash).toHaveLength(32);
  });
});
