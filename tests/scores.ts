// ABOUTME: Score texts that more than one seam-1 test file needs, so each is written once.
// ABOUTME: Not a test file: vitest does not collect it.

/** A song2 text the reader refuses: its one note has a duration, 5, that the format does not allow (line 9). */
export const UNREADABLE_SCORE = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C5|`;
