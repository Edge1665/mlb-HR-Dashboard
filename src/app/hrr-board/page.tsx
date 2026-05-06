import AppLayout from "@/components/AppLayout";
import HRRProbabilityBoardClient from "./HRRProbabilityBoardClient";

export const dynamic = "force-dynamic";

export default function HRRBoardPage() {
  return (
    <AppLayout currentPath="/hrr-board">
      <HRRProbabilityBoardClient />
    </AppLayout>
  );
}
