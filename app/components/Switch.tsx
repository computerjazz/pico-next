function Switch({ isOn, onChange }: { isOn?: boolean; onChange?: () => void }) {
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
        <div className="w-11 h-6 bg-accent-foreground peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-muted-foreground rounded-full peer dark:bg-accent-foreground transition-colors peer-checked:bg-muted-foreground"></div>
        <div
          className={`absolute left-0 top-0 w-6 h-6 rounded-full bg-white border border-gray-300 transition-transform duration-300 transform ${
            isOn ? "translate-x-5" : ""
          }`}
        ></div>
      </label>
    </div>
  );
}

export default Switch;
