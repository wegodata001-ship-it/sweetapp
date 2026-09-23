import {
  CLIENT_MODELS,
  FK_RULES,
  USER_EXCLUDED_FIELDS,
  type ClientModelDef,
} from "./catalog";
import { ALWAYS_EXCLUDED_FIELDS } from "./serialize";

export type CountResult = {
  model: string;
  sourceCount: number;
  exportedCount: number;
  status: "PASS" | "FAIL" | "EXCLUDED";
};

export type BrokenFk = {
  model: string;
  field: string;
  recordId: string;
  targetModel: string;
  value: string;
};

export type ValidationReport = {
  expectedClientModels: number;
  coveredClientModels: number;
  counts: CountResult[];
  countsPass: boolean;
  brokenForeignReferences: BrokenFk[];
  relationsValid: number;
  relationsBroken: number;
  secretsExcluded: boolean;
  passwordsExcluded: boolean;
  passwordResetTokensExcluded: boolean;
};

export function reconcileCounts(
  models: Array<{ def: ClientModelDef; sourceCount: number; rows: unknown[] }>,
): CountResult[] {
  return models.map(({ def, sourceCount, rows }) => ({
    model: def.model,
    sourceCount,
    exportedCount: rows.length,
    status: sourceCount === rows.length ? "PASS" : "FAIL",
  }));
}

export function findBrokenForeignKeys(
  byModel: Record<string, Record<string, unknown>[]>,
): { broken: BrokenFk[]; valid: number } {
  const idSets = new Map<string, Set<string>>();
  for (const def of CLIENT_MODELS) {
    const rows = byModel[def.model] ?? [];
    idSets.set(
      `${def.model}.${def.idField}`,
      new Set(rows.map((r) => String(r[def.idField] ?? ""))),
    );
  }

  const broken: BrokenFk[] = [];
  let valid = 0;

  for (const rule of FK_RULES) {
    const rows = byModel[rule.model] ?? [];
    const targets = idSets.get(`${rule.targetModel}.${rule.targetField}`) ?? new Set();
    const idField = CLIENT_MODELS.find((m) => m.model === rule.model)?.idField ?? "id";
    for (const row of rows) {
      const raw = row[rule.field];
      if (raw === null || raw === undefined || raw === "") {
        if (rule.optional) continue;
        broken.push({
          model: rule.model,
          field: rule.field,
          recordId: String(row[idField] ?? ""),
          targetModel: rule.targetModel,
          value: "",
        });
        continue;
      }
      const value = String(raw);
      if (targets.has(value)) {
        valid += 1;
      } else {
        broken.push({
          model: rule.model,
          field: rule.field,
          recordId: String(row[idField] ?? ""),
          targetModel: rule.targetModel,
          value,
        });
      }
    }
  }

  return { broken, valid };
}

export function scanForbiddenFields(rowsByModel: Record<string, Record<string, unknown>[]>): {
  secretsExcluded: boolean;
  passwordsExcluded: boolean;
  passwordResetTokensExcluded: boolean;
  leaked: string[];
} {
  const leaked: string[] = [];
  const forbidden = new Set<string>([...ALWAYS_EXCLUDED_FIELDS, ...USER_EXCLUDED_FIELDS]);

  if (rowsByModel.PasswordResetToken) {
    leaked.push("PasswordResetToken table present");
  }

  for (const [model, rows] of Object.entries(rowsByModel)) {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (forbidden.has(key) || key.toLowerCase() === "passwordhash" || key.toLowerCase() === "currentsessionid") {
          leaked.push(`${model}.${key}`);
        }
      }
    }
  }

  const passwordsExcluded = !leaked.some((x) => x.toLowerCase().includes("passwordhash"));

  return {
    secretsExcluded: leaked.length === 0,
    passwordsExcluded,
    passwordResetTokensExcluded: !Object.keys(rowsByModel).includes("PasswordResetToken"),
    leaked,
  };
}

export function buildValidationReport(input: {
  models: Array<{ def: ClientModelDef; sourceCount: number; rows: Record<string, unknown>[] }>;
  approvedMapCount: number;
}): ValidationReport {
  const byModel: Record<string, Record<string, unknown>[]> = {};
  for (const m of input.models) byModel[m.def.model] = m.rows;
  const counts = reconcileCounts(input.models);
  const { broken, valid } = findBrokenForeignKeys(byModel);
  const secrets = scanForbiddenFields(byModel);
  return {
    expectedClientModels: input.approvedMapCount,
    coveredClientModels: input.models.length,
    counts,
    countsPass: counts.every((c) => c.status === "PASS"),
    brokenForeignReferences: broken,
    relationsValid: valid,
    relationsBroken: broken.length,
    secretsExcluded: secrets.secretsExcluded,
    passwordsExcluded: secrets.passwordsExcluded,
    passwordResetTokensExcluded: secrets.passwordResetTokensExcluded,
  };
}
