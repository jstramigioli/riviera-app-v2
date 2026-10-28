import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPeriodsWithMatrix } from "@/lib/rates";
import { TarifasBoard } from "@/components/TarifasBoard";

export default async function TarifasPage() {
  const session = await getSession();
  const canEdit = session.user?.role === "ADMIN";
  const { periods, overlaps, categories, serviceTypes } =
    await listPeriodsWithMatrix(prisma);

  return (
    <div className="fade-up">
      <TarifasBoard
        initialPeriods={periods}
        overlaps={overlaps}
        categories={categories}
        serviceTypes={serviceTypes}
        canEdit={Boolean(canEdit)}
      />
    </div>
  );
}
