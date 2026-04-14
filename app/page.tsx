import { Assistant } from "./assistant";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { GuestModal } from "@/components/ui/guest-modal";
import { dbConnection } from "@/lib/db";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");

  return (
    <>
      <Assistant />
      {role === "guest" && enableGuest !== "true" && <GuestModal />}
    </>
  );
}
