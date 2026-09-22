export * from './gomoku';
export { bestMove, botPlay } from './gomoku.ai';
export type { Level } from './gomoku.ai';
export * from './deduction';
export * from './pograniche';
// Судоку — под своим неймспейсом, не export *: имена countSolutions/
// TooHeavyError/uniqueSolution/nextHint/isReleasable/IssueLevel/
// ValidationIssue совпадают с deduction (тот же жанр задачи — генерация
// и проверка головоломки), а означают разное. Плоский re-export столкнул
// бы их молча; неймспейс делает разницу видимой на месте использования:
// `sudoku.nextHint(...)` вместо двусмысленного `nextHint(...)`.
export * as sudoku from './sudoku';
