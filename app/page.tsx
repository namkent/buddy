import { Assistant } from "./assistant";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { GuestModal } from "@/components/ui/guest-modal";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  return (
    <>
      <Assistant />
      {role === "guest" && <GuestModal />}
    </>
  );
}
