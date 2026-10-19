import { Badge } from "@/components/ui/badge";
import type { AiJobDTO } from "@/server/face-swap";

export const JOB_STATUS_LABEL: Record<AiJobDTO["status"], string> = {
  PENDING_APPROVAL: "ממתין לאישור עלות",
  QUEUED: "בתור לעיבוד",
  RUNNING: "בעיבוד",
  SUCCEEDED: "הושלם",
  FAILED: "נכשל",
  CANCELED: "בוטל",
};

export function JobStatusBadge({ status }: { status: AiJobDTO["status"] }) {
  const variant = status === "SUCCEEDED" ? "success" : status === "FAILED" ? "danger" : status === "CANCELED" ? "muted" : "gold";
  return <Badge variant={variant}>{JOB_STATUS_LABEL[status]}</Badge>;
}
