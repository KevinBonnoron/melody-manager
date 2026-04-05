import { describe, expect, it } from 'bun:test';
import { parseChaptersFromText } from './yt-dlp.util';

describe('parseChaptersFromText', () => {
  describe('timestamp first formats', () => {
    it('parses "TIMESTAMP - Title"', () => {
      const text = `0:00 - Introduction
3:45 - First Movement
7:30 - Second Movement`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
      expect(chapters[2]).toMatchObject({ title: 'Second Movement', start_time: 450, end_time: 600 });
    });

    it('parses "TIMESTAMP Title" (no separator)', () => {
      const text = `0:00 Introduction
3:45 First Movement
7:30 Second Movement`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
    });

    it('parses "[TIMESTAMP] Title"', () => {
      const text = `[0:00] Introduction
[3:45] First Movement`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
    });

    it('parses "TIMESTAMP – Title" (en dash)', () => {
      const text = `0:00 – Introduction
3:45 – First Movement`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
    });

    it('strips track numbers from "TIMESTAMP NN Title"', () => {
      const text = `0:00 01 Introduction
3:45 02 First Movement`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
    });

    it('parses H:MM:SS timestamps', () => {
      const text = `0:00 Introduction
1:03:33 Boss Battle
2:05:23 Credits`;
      const chapters = parseChaptersFromText(text, 8000);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Boss Battle', start_time: 3813 });
      expect(chapters[2]).toMatchObject({ title: 'Credits', start_time: 7523 });
    });
  });

  describe('title: timestamp format', () => {
    it('parses "Title: TIMESTAMP"', () => {
      const text = `Introduction: 0:00
First Movement: 3:45`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
    });

    it('parses "NN. Title: TIMESTAMP"', () => {
      const text = `01. Introduction: 0:00
02. First Movement: 3:45`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Introduction', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'First Movement', start_time: 225 });
    });
  });

  describe('trailing timestamp format (NN. Title TIMESTAMP)', () => {
    it('parses "NN. Title TIMESTAMP"', () => {
      const text = `01. Main Menu 0:00
02. Main Menu (Lullaby Ver.) 1:05
03. Tutorial & Kakariko Crypt (Peaceful) 2:11`;
      const chapters = parseChaptersFromText(text, 300);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ title: 'Main Menu', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Main Menu (Lullaby Ver.)', start_time: 65 });
      expect(chapters[2]).toMatchObject({ title: 'Tutorial & Kakariko Crypt (Peaceful)', start_time: 131 });
    });

    it('parses "N-NN Title TIMESTAMP" (dash-separated track numbers)', () => {
      const text = `1-01 Main Theme 0:00
1-02 Opening [Episode One]  01:10
1-03 The Book [First Episode]  01:52
1-04 Captain Toad Marches Forth! [Plucky Pass Beginnings]  03:45
1-05 Ruins [Day Time]  06:37
1-06 Ruins [Night Time]  08:48
1-07 Clear!  11:38
1-08 Toad Camps Out  11:44
1-09 Bonus Chance   12:03`;
      const chapters = parseChaptersFromText(text, 800);
      expect(chapters).toHaveLength(9);
      expect(chapters[0]).toMatchObject({ title: 'Main Theme', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Opening [Episode One]', start_time: 70 });
      expect(chapters[2]).toMatchObject({ title: 'The Book [First Episode]', start_time: 112 });
      expect(chapters[3]).toMatchObject({ title: 'Captain Toad Marches Forth! [Plucky Pass Beginnings]', start_time: 225 });
      expect(chapters[4]).toMatchObject({ title: 'Ruins [Day Time]', start_time: 397 });
      expect(chapters[5]).toMatchObject({ title: 'Ruins [Night Time]', start_time: 528 });
      expect(chapters[6]).toMatchObject({ title: 'Clear!', start_time: 698 });
      expect(chapters[7]).toMatchObject({ title: 'Toad Camps Out', start_time: 704 });
      expect(chapters[8]).toMatchObject({ title: 'Bonus Chance', start_time: 723, end_time: 800 });
    });

    it('parses trailing H:MM:SS timestamps', () => {
      const text = `28. Temple of Storms (Combat) [Glockenspiel Ver.] 1:01:08
29. Gleeokenspiel Boss Battle 1:03:33`;
      const chapters = parseChaptersFromText(text, 4000);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Temple of Storms (Combat) [Glockenspiel Ver.]', start_time: 3668 });
      expect(chapters[1]).toMatchObject({ title: 'Gleeokenspiel Boss Battle', start_time: 3813 });
    });

    it('handles no space before timestamp', () => {
      const text = `29. Gleeokenspiel Boss Battle1:03:33
30. Game Over 1:06:15`;
      const chapters = parseChaptersFromText(text, 4000);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'Gleeokenspiel Boss Battle', start_time: 3813 });
      expect(chapters[1]).toMatchObject({ title: 'Game Over', start_time: 3975 });
    });

    it('parses full Zelda OST tracklist', () => {
      const text = `Crypt of the NecroDancer Featuring The Legend of Zelda

Tracklist
Main Soundtrack
01. Main Menu 0:00
02. Main Menu (Lullaby Ver.) 1:05
03. Tutorial & Kakariko Crypt (Peaceful) 2:11
04. Tutorial & Kakariko Crypt (Combat) 3:55
05. Overworld (Peaceful) 5:39
06. Overworld (Combat) 10:04
07. Hyrule Castle Dungeon (Peaceful) 14:30
08. Hyrule Castle Dungeon (Combat) 17:16
09. Lost Woods (Peaceful) 20:04
10. Lost Woods (Combat) 23:07

More Soundtrack (Full Tracklist in the Comments)
01. Tutorial & Kakariko Crypt (Low) 2:05:23`;
      const chapters = parseChaptersFromText(text, 8000);
      expect(chapters).toHaveLength(11);
      expect(chapters[0]).toMatchObject({ title: 'Main Menu', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Main Menu (Lullaby Ver.)', start_time: 65 });
      expect(chapters[7]).toMatchObject({ title: 'Hyrule Castle Dungeon (Combat)', start_time: 1036 });
      expect(chapters[10]).toMatchObject({ title: 'Tutorial & Kakariko Crypt (Low)', start_time: 7523 });
    });

    it('ignores non-chapter lines in mixed content', () => {
      const text = `Album Title

Tracklist
01. First Track 0:00
02. Second Track 3:45

More info at example.com`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject({ title: 'First Track', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Second Track', start_time: 225, end_time: 600 });
    });
  });

  describe('edge cases', () => {
    it('returns empty for text without chapters', () => {
      const text = `This is just a description without any timestamps.
Check out my channel for more music!`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(0);
    });

    it('returns single chapter (caller filters if needed)', () => {
      const text = `0:00 Only one chapter`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(1);
      expect(chapters[0]).toMatchObject({ title: 'Only one chapter', start_time: 0, end_time: 600 });
    });

    it('sorts chapters by start time', () => {
      const text = `3:45 Second
0:00 First
7:30 Third`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toMatchObject({ title: 'First', start_time: 0 });
      expect(chapters[1]).toMatchObject({ title: 'Second', start_time: 225 });
      expect(chapters[2]).toMatchObject({ title: 'Third', start_time: 450 });
    });

    it('sets end_time to next chapter start_time', () => {
      const text = `0:00 First
3:00 Second
6:00 Third`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters[0]?.end_time).toBe(180);
      expect(chapters[1]?.end_time).toBe(360);
      expect(chapters[2]?.end_time).toBe(600);
    });

    it('handles duplicate start times gracefully', () => {
      const text = `0:00 First
0:00 Also First
3:00 Second`;
      const chapters = parseChaptersFromText(text, 600);
      expect(chapters.length).toBeGreaterThanOrEqual(2);
      for (const ch of chapters) {
        expect(ch.end_time).toBeGreaterThan(ch.start_time);
      }
    });
  });
});
