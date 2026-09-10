export type {
  Case,
  Category,
  Clue,
  ClueKind,
  Deduction,
  HintReason,
  MarkValue,
  PlayerMarks,
  Ref,
  Solution,
} from './types';

export { buildModel, indexOf, markKey, positionOf, resolveOrder, subjectOf } from './model';
export type { Model } from './model';

export {
  MAX_ASSIGNMENTS,
  assignmentCount,
  checkClue,
  countSolutions,
  describeSolution,
  permutations,
  solveCase,
  uniqueSolution,
} from './solve';
export type { SolveResult } from './solve';

export { deduceCase, nextHint } from './board';
export type { CellState, DeduceResult } from './board';

export { formatIssues, isReleasable, validateCase } from './validate';
export type { IssueLevel, ValidationIssue } from './validate';