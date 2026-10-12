import { fireEvent, render, screen } from "@testing-library/react-native";
import { Toggle } from "../Toggle";

describe("Toggle", () => {
  it("is a named switch exposing its checked state", async () => {
    await render(<Toggle value accessibilityLabel="Autoplay previews" onValueChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Autoplay previews" });
    expect(sw).toBeChecked();
  });

  it("asks for the opposite value when pressed", async () => {
    const onValueChange = jest.fn();
    await render(<Toggle value={false} accessibilityLabel="Upload on Wi-Fi only" onValueChange={onValueChange} />);
    await fireEvent.press(screen.getByRole("switch", { name: "Upload on Wi-Fi only" }));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("does nothing when disabled", async () => {
    const onValueChange = jest.fn();
    await render(<Toggle value accessibilityLabel="Locked" disabled onValueChange={onValueChange} />);
    const sw = screen.getByRole("switch", { name: "Locked" });
    expect(sw).toBeDisabled();
    await fireEvent.press(sw);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
