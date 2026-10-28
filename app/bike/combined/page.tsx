import RouteMap from "@/app/components/RouteMap";
import BikeStats from "../stats/BikeStats";

export const metadata = { title: "Map" };

export default function MapPage() {
  return (
    <div className="flex flex-1">
      <div className="flex flex-3">
        <RouteMap />
      </div>
      <div className="flex flex-1 overflow-scroll">
        <BikeStats timerSize="text-6xl" />
      </div>
    </div>
  );
}
