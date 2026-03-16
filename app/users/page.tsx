import { db } from "@/db";
import { users } from "@/db/schema";
import UserItem from "./UserItem";

export default async function UsersPage() {
  const allUsers = await db.select().from(users);

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>

      <ul className="list-none p-2 mt-4">
        {allUsers.map((user) => (
          <UserItem key={user.id} user={user} />
        ))}
      </ul>
    </div>
  );
}
