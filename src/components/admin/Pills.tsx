import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { titleCase } from "@/lib/format";

/** active / blocked account status. */
export function StatusPill({ status }: { status: "active" | "blocked" }) {
  return status === "blocked" ? (
    <Badge tone="danger">
      <Icon name="ban" size={12} />
      Blocked
    </Badge>
  ) : (
    <Badge tone="teal">Active</Badge>
  );
}

/** admin / user role. */
export function RolePill({ role }: { role: "user" | "admin" }) {
  return role === "admin" ? (
    <Badge tone="ink">
      <Icon name="shield" size={12} />
      Admin
    </Badge>
  ) : (
    <Badge tone="neutral">User</Badge>
  );
}

/** A plan name chip — teal for paid, neutral for free. */
export function PlanPill({ plan }: { plan: string }) {
  const paid = plan.toLowerCase() !== "free";
  return <Badge tone={paid ? "teal" : "neutral"}>{titleCase(plan)}</Badge>;
}

/** Subscription lifecycle status. */
export function SubStatusPill({
  status,
}: {
  status: "active" | "expired" | "cancelled";
}) {
  const tone = status === "active" ? "teal" : status === "expired" ? "amber" : "neutral";
  return <Badge tone={tone}>{titleCase(status)}</Badge>;
}

/** Payment/transaction status. */
export function PaymentStatusPill({
  status,
}: {
  status: "pending" | "success" | "failed" | "refunded";
}) {
  const tone =
    status === "success"
      ? "teal"
      : status === "failed"
        ? "danger"
        : status === "refunded"
          ? "amber"
          : "neutral";
  return <Badge tone={tone}>{titleCase(status)}</Badge>;
}
