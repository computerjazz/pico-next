import { fetchMealData } from "./actions";
import type { MealDay } from "../../../lib/lausd";

function Meal({ meal }: { meal: MealDay }) {
  const dateStr = new Date(`${meal.date}T00:00:00`).toDateString();
  return (
    <section className="p-2">
      <h2 className="text-xl font-bold">{meal.date}</h2>
      <h2 className="text-xl font-bold">{dateStr}</h2>
      <ul className="flex flex-col gap-4">
        {meal.dishes.map((dish) => (
          <li key={dish.id} className="flex items-center gap-4">
            <img
              className="w-12 h-12 object-cover rounded-lg"
              src={dish.imageUrl ?? ""}
              alt={dish.name}
            />
            {dish.name}
            {/* {Object.entries(dish.nutrients).map(([name, qty]) => (
              <span key={name}>
                {name}: {qty}
              </span>
            ))} */}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function LunchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const schoolSlug =
    typeof params.schoolSlug === "string" ? params.schoolSlug : "";
  const schoolId = typeof params.schoolId === "string" ? params.schoolId : "";
  const meal = typeof params.meal === "string" ? params.meal : "BF";
  const mealData = await fetchMealData({ schoolSlug, schoolId, meal });
  const mainMenu = mealData?.menus?.[0] ?? { name: "", days: [] };
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{mainMenu.name}</h1>
      <div className="flex flex-col gap-4">
        {mainMenu.days.map((day) => (
          <Meal key={day.date} meal={day} />
        ))}
      </div>
    </div>
  );
}
