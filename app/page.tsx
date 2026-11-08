import ChatApp from "@/components/chat-app";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  return <ChatApp user={user} />;
}
