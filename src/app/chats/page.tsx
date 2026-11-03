import type { Metadata } from "next";

import { ChatsView } from "@/ui/chat/chats-view";

export const metadata: Metadata = { title: "Chats | ZooMatch" };

export default function ChatsPage() {
  return <ChatsView />;
}
