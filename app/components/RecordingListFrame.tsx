function CornerMask({ className }: { className?: string }) {
  return (
    <svg
      className={`${className}`}
      width="20"
      height="20"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="
          M0,0
          H40
          V40
          H0
          Z
          M0,40
          A40,40 0 0 1 40,0
          L40,40
          Z
        "
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function ListMask() {
  return (
    <>
      <div className={`flex bg-background flex-1`} />

      <div className="max-w-md flex flex-1000">
        <div className={`flex flex-99 justify-between text-background`}>
          {/* Top Left Mask SVG */}
          <div className="flex flex-row">
            <div className={`flex-1 bg-background`} />
            <div className={`w-4 h-12 bg-background rounded-br-full`} />

            <CornerMask className="translate-x-[-1px]" />
          </div>
          <div className="flex flex-1 max-w-md" />
          <div className="flex flex-row">
            <CornerMask className="-scale-x-100 translate-x-[1px]" />
            <div className={`w-4 h-12 bg-background rounded-bl-full`} />
          </div>
        </div>
      </div>
      <div className={`flex bg-background flex-1`} />
    </>
  );
}

function RecordingListFrame() {
  return (
    <>
      <div
        className="absolute flex flex-1 flex-row left-0 right-0 top-0 z-40 justify-center"
        style={{ transform: "translateY(-1px)" }}
      >
        <ListMask />
      </div>
      <div
        className="absolute flex flex-1 flex-row left-0 right-0 bottom-0 z-40 justify-center rotate-180"
        style={{ transform: "translateY(-1px)" }}
      >
        <ListMask />
      </div>
    </>
  );
}

export default RecordingListFrame;
