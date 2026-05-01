import { db } from "@/db";
import { renameDevice } from "@/app/actions/renameDevice";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

export default async function DevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const deviceId = (await params).id;

  const device = await db.query.devices.findFirst({
    where: (d, { eq }) => eq(d.deviceId, deviceId),
  });

  if (!device) {
    notFound();
  }

  async function onRename(formData: FormData) {
    "use server";
    const newName = formData.get("name") as string;
    if (!deviceId || typeof newName !== "string") return;
    await renameDevice({ deviceId, name: newName });
    revalidatePath(`/device/${deviceId}`);
  }

  return (
    <div className="mx-auto max-w-xl p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-2">
        Device:{" "}
        {device.name ?? (
          <span className="italic text-neutral-500">Unnamed</span>
        )}
      </h1>
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">Device ID:</span> {device.deviceId}
        </div>
        <div>
          <span className="font-semibold">Type:</span> {device.type}
        </div>
        {device.firmwareVersion && (
          <div>
            <span className="font-semibold">Firmware Version:</span>{" "}
            {device.firmwareVersion}
          </div>
        )}
        <div>
          <span className="font-semibold">Created:</span>{" "}
          {device.createdAt?.toLocaleString?.() ?? "unknown"}
        </div>
      </div>
      <form action={onRename} className="space-y-2 max-w-xs">
        <label htmlFor="name" className="block font-medium text-sm">
          Update device name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={device.name ?? ""}
          className="w-full px-2 py-1 border rounded"
          maxLength={50}
          autoComplete="off"
        />
        <button
          type="submit"
          className="mt-2 px-4 py-1 bg-blue-500 text-white rounded"
        >
          Rename
        </button>
      </form>
    </div>
  );
}
