import { describe, expect, it } from 'bun:test';
import { normalizeTrackTitle } from './title.util';

describe('normalizeTrackTitle', () => {
  it.each([
    // Surrounding double quotes
    ['"Bohemian Rhapsody - Queen"', 'Bohemian Rhapsody - Queen'],
    // Internal quotes preserved
    ['The "Real" Slim Shady', 'The "Real" Slim Shady'],
    // Leading dash + whitespace
    [' - Take Five', 'Take Five'],
    // Leading whitespace only
    ['  Stairway to Heaven', 'Stairway to Heaven'],
    // Quoted with leading dash inside
    ['" - So What"', 'So What'],
    // Dash-only title preserved
    ['-', '-'],
    // Empty quotes preserved
    ['""', '""'],
    // Multiple quoted segments (strips outer, keeps inner)
    ['"Nessun" - "Dorma"', 'Nessun" - "Dorma'],
    // Single quotes
    ["'Clair de Lune - Debussy'", 'Clair de Lune - Debussy'],
    ["'My Generation'", 'My Generation'],
    ["' - Blue in Green'", 'Blue in Green'],
    ["The 'Real' Folk Blues", "The 'Real' Folk Blues"],
    ["''", "''"],
    // Nested quotes
    [`'"Für Elise"'`, 'Für Elise'],
    [`"'Für Elise'"`, 'Für Elise'],
    // Unmatched leading quote
    ['"Autumn Leaves - Bill Evans', 'Autumn Leaves - Bill Evans'],
    ["'Autumn Leaves - Bill Evans", 'Autumn Leaves - Bill Evans'],
    // Unmatched trailing quote
    ['Autumn Leaves - Bill Evans"', 'Autumn Leaves - Bill Evans'],
    ["Autumn Leaves - Bill Evans'", 'Autumn Leaves - Bill Evans'],
    // Full real-world case: after timecode/dash removal, leftover unmatched quote
    ['- "Nausicaä - Requiem', 'Nausicaä - Requiem'],
  ])('should normalize "%s" to "%s"', (input, expected) => {
    expect(normalizeTrackTitle(input)).toBe(expected);
  });
});
