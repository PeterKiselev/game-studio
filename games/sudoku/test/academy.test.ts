import { describe, expect, it } from 'vitest';
import { ACADEMY_LESSONS, prepareAcademyLesson } from '../src/academy';

describe('академия Sudoku', () => {
  it('содержит двенадцать последовательных уроков с уникальными id', () => {
    expect(ACADEMY_LESSONS).toHaveLength(12);
    expect(new Set(ACADEMY_LESSONS.map((lesson) => lesson.id)).size).toBe(12);
  });

  it.each(ACADEMY_LESSONS.map((lesson) => [lesson.id, lesson] as const))(
    'урок %s действительно демонстрирует заявленный приём',
    (_id, lesson) => {
      const prepared = prepareAcademyLesson(lesson);
      expect(prepared.hint.technique).toBe(lesson.technique);
      expect(prepared.hint.value).toBe(prepared.solution[prepared.hint.index]);
      expect(prepared.grid[prepared.hint.index]).toBe(0);
    },
  );
});
