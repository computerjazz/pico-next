import PageHeader from "../components/PageHeader";

function TogglePage() {
  return (
    <div className="min-h-screen">
      <main className="flex flex-col gap-6">
        <PageHeader>
          <div className="flex flex-row gap-4 items-center">
            <h1 className="text-3xl font-bold text-accent mb-2">Toggle</h1>
          </div>
        </PageHeader>
        Coming soon
      </main>
    </div>
  );
}

export default TogglePage;
