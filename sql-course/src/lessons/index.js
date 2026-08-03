// Agrège les 15 modules du parcours SQL, dans l'ordre pédagogique.
import { M00, M01, M02, M03, M04, M05, M06 } from './modules/basics.js';
import { M07, M08, M09, M10 } from './modules/intermediate.js';
import { M11, M12, M13, M14 } from './modules/advanced.js';

export const MODULES = [
  M00, M01, M02, M03, M04, M05, M06, // Fondations → GROUP BY
  M07, M08, M09, M10,                // JOIN, sous-requêtes, CTE, CASE/NULL
  M11, M12, M13, M14,                // Window functions, vues, DML, DDL/perf
];
