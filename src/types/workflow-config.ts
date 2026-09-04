export interface WorkflowRules {
  requiredFields: string[];
  requiredDocuments: string[];
  allowedDays: string[];
  allowedTimeSlots: { start: string; end: string }[];
}

export interface PutWorkflowConfigInput extends WorkflowRules {
  adminId: string;
  instructions: string;
}
