import { describe, expect, it } from 'bun:test';
import { normalizeTrackTitle } from './title.util';

describe('normalizeTrackTitle', () => {
  it.each([
    ['"Dark World - The Legend of Zelda - A Link to the Past"', 'Dark World - The Legend of Zelda - A Link to the Past'],
    ['The "Legend" of Zelda', 'The "Legend" of Zelda'],
    [' - Song Name', 'Song Name'],
    ['  Song Name', 'Song Name'],
    ['" - Song Name"', 'Song Name'],
    ['-', '-'],
    ['""', '""'],
    ['"Song" - "Part 2"', 'Song" - "Part 2'],
  ])('should normalize "%s" to "%s"', (input, expected) => {
    expect(normalizeTrackTitle(input)).toBe(expected);
  });
});
