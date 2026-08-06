/*
 * Grading and ranking arithmetic. These two functions decide the grade printed
 * on a report a family reads, and the rank a student is publicly placed at, so
 * the boundary cases below are the ones that would be argued about.
 */

import {
  clamp100,
  gradeFor,
  rankingScore,
  round2,
  starterFor,
  DEFAULT_ASSESSMENT_CONFIG,
  DEFAULT_BADGES,
  DEFAULT_GRADE_BANDS,
  STARTER_TEMPLATES,
  type RankingWeightage,
} from './assessment.config';

const BANDS = DEFAULT_GRADE_BANDS;

describe('gradeFor — the shipped A+..F ladder', () => {
  it.each([
    [100, 'A+'], [97, 'A+'], [95, 'A+'],
    [94, 'A'], [90, 'A'],
    [89, 'B+'], [80, 'B+'],
    [79, 'B'], [70, 'B'],
    [69, 'C'], [60, 'C'],
    [59, 'D'], [50, 'D'],
    [49, 'F'], [0, 'F'],
  ])('%i%% is %s', (pct, grade) => {
    expect(gradeFor(pct, BANDS)).toBe(grade);
  });

  /*
   * Every boundary in the spec, asserted from both sides. A ladder built from
   * "greater than" instead of "at least" moves each of these down a grade, and
   * nobody notices until a family asks why 90% was not an A.
   */
  it.each([
    [95, 'A+', 94.99, 'A'],
    [90, 'A', 89.99, 'B+'],
    [80, 'B+', 79.99, 'B'],
    [70, 'B', 69.99, 'C'],
    [60, 'C', 59.99, 'D'],
    [50, 'D', 49.99, 'F'],
  ])('%i is %s and %s is %s', (hi, hiGrade, lo, loGrade) => {
    expect(gradeFor(hi, BANDS)).toBe(hiGrade);
    expect(gradeFor(lo, BANDS)).toBe(loGrade);
  });

  it('accepts Decimal columns arriving as strings', () => {
    const asStrings = BANDS.map((b) => ({
      grade: b.grade,
      minPercent: String(b.minPercent),
      maxPercent: String(b.maxPercent),
    }));
    expect(gradeFor(91, asStrings)).toBe('A');
  });

  /*
   * The bands are admin-editable, so they will not always be tidy. Overlapping
   * bands must resolve by highest-minimum rather than by row order, otherwise
   * the same percentage grades differently depending on how the rows were saved.
   */
  it('gives the highest matching band when an admin overlaps them', () => {
    const overlapping = [
      { grade: 'B', minPercent: 70, maxPercent: 95 },
      { grade: 'A', minPercent: 90, maxPercent: 100 },
    ];
    expect(gradeFor(92, overlapping)).toBe('A');
    expect(gradeFor(92, [...overlapping].reverse())).toBe('A');
  });

  it('returns null rather than a wrong grade when nothing matches', () => {
    expect(gradeFor(55, [{ grade: 'A', minPercent: 90, maxPercent: 100 }])).toBeNull();
    expect(gradeFor(50, [])).toBeNull();
  });
});

describe('clamp100', () => {
  it('holds the 0..100 range', () => {
    expect(clamp100(50)).toBe(50);
    expect(clamp100(0)).toBe(0);
    expect(clamp100(100)).toBe(100);
    expect(clamp100(140)).toBe(100);
    expect(clamp100(-10)).toBe(0);
  });

  /*
   * Unusable input collapses to 0, including Infinity — it is rejected as
   * non-finite rather than clamped to 100. That is the safe direction: a
   * corrupt component must not be able to inflate a student's rank.
   */
  it('treats unusable input as zero instead of poisoning the score with NaN', () => {
    expect(clamp100(NaN)).toBe(0);
    expect(clamp100(Infinity)).toBe(0);
    expect(clamp100(-Infinity)).toBe(0);
    expect(clamp100(undefined as unknown as number)).toBe(0);
    expect(clamp100('abc' as unknown as number)).toBe(0);
  });
});

describe('rankingScore', () => {
  const SPEC: RankingWeightage = DEFAULT_ASSESSMENT_CONFIG.ranking;

  it('uses the spec weightage 50/20/15/10/5', () => {
    expect(SPEC).toEqual({ assessment: 50, attendance: 20, assignment: 15, homework: 10, teacherRating: 5 });
  });

  it('is a straight weighted average when the weights already total 100', () => {
    const score = rankingScore(
      { assessment: 90, attendance: 100, assignment: 80, homework: 100, teacherRating: 80 },
      SPEC,
    );
    // 45 + 20 + 12 + 10 + 4
    expect(score).toBe(91);
  });

  it('is 100 only when every component is', () => {
    expect(
      rankingScore({ assessment: 100, attendance: 100, assignment: 100, homework: 100, teacherRating: 100 }, SPEC),
    ).toBe(100);
  });

  it('is 0 when every component is', () => {
    expect(rankingScore({ assessment: 0, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 }, SPEC)).toBe(0);
  });

  /*
   * Weights are admin-editable and nothing forces them to total 100. Without
   * re-normalisation a well-meaning admin who sets 60/20/15/10/5 produces
   * scores above 100 and a leaderboard that reads as broken.
   */
  it('re-normalises weights that do not add to 100', () => {
    const over: RankingWeightage = { assessment: 60, attendance: 20, assignment: 15, homework: 10, teacherRating: 5 };
    const score = rankingScore(
      { assessment: 100, attendance: 100, assignment: 100, homework: 100, teacherRating: 100 },
      over,
    );
    expect(score).toBe(100);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('redistributes the share of a component an admin zeroes out', () => {
    const noRating: RankingWeightage = { assessment: 50, attendance: 50, assignment: 0, homework: 0, teacherRating: 0 };
    expect(rankingScore({ assessment: 90, attendance: 70, assignment: 0, homework: 0, teacherRating: 0 }, noRating)).toBe(80);
  });

  it('treats a negative weight as zero rather than subtracting from the score', () => {
    const negative: RankingWeightage = { assessment: 100, attendance: -50, assignment: 0, homework: 0, teacherRating: 0 };
    expect(rankingScore({ assessment: 80, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 }, negative)).toBe(80);
  });

  it('is 0, not NaN, when every weight is zero', () => {
    const none: RankingWeightage = { assessment: 0, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 };
    expect(rankingScore({ assessment: 90, attendance: 90, assignment: 90, homework: 90, teacherRating: 90 }, none)).toBe(0);
  });

  it('clamps a component that arrives out of range', () => {
    const onlyAssessment: RankingWeightage = { assessment: 100, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 };
    expect(rankingScore({ assessment: 140, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 }, onlyAssessment)).toBe(100);
    expect(rankingScore({ assessment: -20, attendance: 0, assignment: 0, homework: 0, teacherRating: 0 }, onlyAssessment)).toBe(0);
  });

  it('rounds to two places, so two students are not tied by invisible digits', () => {
    const score = rankingScore(
      { assessment: 87.777, attendance: 91.333, assignment: 74.5, homework: 66.66, teacherRating: 80 },
      DEFAULT_ASSESSMENT_CONFIG.ranking,
    );
    expect(round2(score)).toBe(score);
    expect(String(score).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe('starterFor', () => {
  it('matches the three courses the spec names', () => {
    expect(starterFor('Quran Recitation & Memorization')?.key).toBe('QURAN');
    expect(starterFor('Arabic Language Study')?.key).toBe('ARABIC');
    expect(starterFor('Islamic Studies')?.key).toBe('ISLAMIC_STUDIES');
  });

  it('is case-insensitive and matches a title containing the keyword', () => {
    expect(starterFor('ADVANCED TAJWEED MASTERCLASS')?.key).toBe('QURAN');
    expect(starterFor('Beginner arabic for kids')?.key).toBe('ARABIC');
  });

  /*
   * "Islamic Studies" contains "islamic", which is also an Islamic-Studies
   * keyword — but so would a shorter keyword from another preset be. Longest
   * match wins, so a two-word title is never claimed by a one-word keyword.
   */
  it('lets the longest keyword win', () => {
    expect(starterFor('Islamic Studies Level 2')?.key).toBe('ISLAMIC_STUDIES');
  });

  it('returns null for a course with no shipped rubric', () => {
    expect(starterFor('French Language')).toBeNull();
    expect(starterFor('')).toBeNull();
    expect(starterFor(undefined as unknown as string)).toBeNull();
  });
});

describe('the shipped defaults themselves', () => {
  it('has a rubric whose criteria add up to its maximum', () => {
    for (const t of STARTER_TEMPLATES) {
      const total = t.criteria.reduce((a, c) => a + c.maxMarks, 0);
      expect(`${t.key}:${total}`).toBe(`${t.key}:${t.maxMarks}`);
    }
  });

  it('carries the spec’s criteria counts', () => {
    expect(STARTER_TEMPLATES.find((t) => t.key === 'QURAN')!.criteria).toHaveLength(8);
    expect(STARTER_TEMPLATES.find((t) => t.key === 'ARABIC')!.criteria).toHaveLength(9);
    expect(STARTER_TEMPLATES.find((t) => t.key === 'ISLAMIC_STUDIES')!.criteria).toHaveLength(7);
  });

  it('has a grade ladder that leaves no percentage ungraded', () => {
    for (let pct = 0; pct <= 100; pct += 0.5) {
      expect(gradeFor(pct, DEFAULT_GRADE_BANDS)).not.toBeNull();
    }
  });

  it('ships all six badges from the spec', () => {
    expect(DEFAULT_BADGES.map((b) => b.rule)).toEqual([
      'RANK_1', 'RANK_2', 'RANK_3', 'TOP_10', 'PERFECT_ATTENDANCE', 'MOST_IMPROVED',
    ]);
  });

  it('defaults to the spec’s 15-day minimum and top-10 visibility', () => {
    expect(DEFAULT_ASSESSMENT_CONFIG.minDaysBeforeAssessment).toBe(15);
    expect(DEFAULT_ASSESSMENT_CONFIG.studentVisibleTopN).toBe(10);
  });
});
