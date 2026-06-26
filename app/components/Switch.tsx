function Switch({ isOn, onChange }: { isOn?: boolean; onChange?: () => void }) {
  const onTrackColor = "muted-foreground";
  const offTrackColor = "muted-foreground";

  return (
    <div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={isOn}
          onChange={onChange}
          className="sr-only peer"
          aria-checked={isOn}
        />
        <div
          className={`
            w-11 
            h-6 
            bg-${onTrackColor} 
            peer-focus:outline-none 
            peer-focus:ring-2 
            peer-focus:ring-offset-2 
            peer-focus:ring-${onTrackColor}
            rounded-full 
            peer 
            dark:bg-${offTrackColor}
            peer-checked:bg-${onTrackColor}
            transition-colors
            `}
        ></div>
        <div
          className={`
            absolute 
            left-0 
            top-0 
            w-6 
            h-6 
            rounded-full 
            bg-white border 
            border-gray-300 
            transition-transform 
            duration-300 
            transform ${isOn ? "translate-x-5" : ""}`}
        ></div>
      </label>
    </div>
  );
}

export default Switch;
