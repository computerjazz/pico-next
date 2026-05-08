"use client";

import { User } from "@/db/schema";

function UserItem({ user }: { user: User }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{user.name}</h2>
      <p className="text-sm text-gray-500">{user.email}</p>
    </div>
  );
}

export default UserItem;
