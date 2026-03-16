import { db } from "@/db";
import { users } from "@/db/schema";

export default async function UsersPage() {
  const allUsers = await db.select().from(users);

  return (
    <div>
      <h1>Users</h1>

      <ul>
        {allUsers.map((user) => (
          <li key={user.id}>
            {user.username} – {user.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
