import { normalizeTrackTitle } from './title.util';
import { describe, expect, it } from 'bun:test';

describe('normalizeTrackTitle', () => {
  it.each([
    ['"Bohemian Rhapsody - Queen"', 'Bohemian Rhapsody - Queen'],
    ['The "Real" Slim Shady', 'The "Real" Slim Shady'],
    [' - Take Five', 'Take Five'],
    ['  Stairway to Heaven', 'Stairway to Heaven'],
    ['" - So What"', 'So What'],
    ['-', '-'],
    ['""', '""'],
    ['"Nessun" - "Dorma"', 'Nessun" - "Dorma'],
    ["'Clair de Lune - Debussy'", 'Clair de Lune - Debussy'],
    ["'My Generation'", 'My Generation'],
    ["' - Blue in Green'", 'Blue in Green'],
    ["The 'Real' Folk Blues", "The 'Real' Folk Blues"],
    ["''", "''"],
    [`'"Für Elise"'`, 'Für Elise'],
    [`"'Für Elise'"`, 'Für Elise'],
    ['"Autumn Leaves - Bill Evans', 'Autumn Leaves - Bill Evans'],
    ["'Autumn Leaves - Bill Evans", 'Autumn Leaves - Bill Evans'],
    ['Autumn Leaves - Bill Evans"', 'Autumn Leaves - Bill Evans'],
    ["Autumn Leaves - Bill Evans'", 'Autumn Leaves - Bill Evans'],
    ['- "Nausicaä - Requiem', 'Nausicaä - Requiem'],
  ])('should normalize "%s" to "%s"', (input, expected) => {
    expect(normalizeTrackTitle(input)).toBe(expected);
  });
});
