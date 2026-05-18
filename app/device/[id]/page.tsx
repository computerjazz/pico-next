async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  return <div>DevicePage {id}</div>;
}

export default DevicePage;
