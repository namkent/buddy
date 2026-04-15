import { Assistant } from "@/app/assistant";
import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { GuestModal } from "@/components/ui/guest-modal";
import { dbConnection } from "@/lib/db";

interface Props {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadPage({ params }: Props) {
  const { threadId } = await params;
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");

  return (
    <>
      <Assistant initialThreadId={threadId} />
      {role === "guest" && enableGuest !== "true" && <GuestModal />}
    </>
  );
}
