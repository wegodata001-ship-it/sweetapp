"use client";

/**
 * Workflow Runner Page — entry point for משימות לעובדים (/admin/workflows).
 * UI lives in CardsWorkflowHub (card grid, inline tasks, mobile-first).
 */

import { CardsWorkflowHub } from "@/components/tasks/cards/cards-workflow-hub";
export type { WorkflowEmployeeOption } from "@/components/tasks/cards/workflow-types";

export function WorkflowRunnerPage({
  employees,
  canManage,
}: {
  employees: import("@/components/tasks/cards/workflow-types").WorkflowEmployeeOption[];
  canManage: boolean;
}) {
  return <CardsWorkflowHub employees={employees} canManage={canManage} />;
}
