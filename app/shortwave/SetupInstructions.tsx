function Item({ children }: { children: React.ReactNode }) {
  return <li>• {children}</li>;
}

function ShortwaveSetupInstructions() {
  return (
    <div className="text-left">
      <h2 className="font-bold underline">Setup</h2>
      <ul className="text-sm">
        <Item>Plug in your Shortwave</Item>
        <Item>
          Connect to the <i>sh0rtwave-setup</i> wifi network on your phone
        </Item>
        <Item>Tap the notification to open the setup page</Item>
        <Item>Select your home wifi network and enter your password</Item>
        <Item>Wait for the status light to turn off</Item>
        <Item>Record your first message!</Item>
      </ul>
    </div>
  );
}

export default ShortwaveSetupInstructions;
