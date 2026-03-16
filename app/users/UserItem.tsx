"use client";
import { users } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

type User = InferSelectModel<typeof users>;

function UserItem({ user }: { user: User }) {
  // INSERT_YOUR_CODE
  if (typeof window !== "undefined") {
    console.log("UserItem is running in the browser!");
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{user.username}</h2>
      <p className="text-sm text-gray-500">{user.email}</p>
    </div>
  );
}

export default UserItem;
