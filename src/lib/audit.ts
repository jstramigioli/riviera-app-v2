import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function writeAudit(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterJson: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      metaJson: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
