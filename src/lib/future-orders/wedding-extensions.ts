/**
 * הרחבות עתידיות למודול חתונות — מבנה מוכן (ללא מימוש DB עדיין).
 * @see WeddingOrderExtensions
 */
export type WeddingOrderExtensions = {
  files?: { id: string; name: string; url?: string }[];
  photos?: { id: string; caption?: string; url?: string }[];
  approvals?: { id: string; label: string; approvedAt?: string; approvedBy?: string }[];
  paymentMilestones?: { id: string; label: string; amount: number; dueDate?: string; paid?: boolean }[];
  preparationStages?: {
    id: string;
    label: string;
    status: "pending" | "in_progress" | "done";
    dueDate?: string;
  }[];
};
