import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../Button";

describe("Button", () => {
  it("is a named button and fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button label="Generate clips" onPress={onPress} />);
    const btn = screen.getByRole("button", { name: "Generate clips" });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled and reports the disabled state", async () => {
    const onPress = jest.fn();
    await render(<Button label="Export" onPress={onPress} disabled />);
    const btn = screen.getByRole("button", { name: "Export" });
    expect(btn).toBeDisabled();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner instead of the label while loading, and is busy + inert", async () => {
    const onPress = jest.fn();
    await render(<Button label="Uploading" onPress={onPress} loading testID="cta" />);
    expect(screen.getByTestId("cta-spinner")).toBeOnTheScreen();
    expect(screen.queryByText("Uploading")).toBeNull();
    const btn = screen.getByRole("button", { name: "Uploading" });
    expect(btn).toBeBusy();
    expect(btn).toBeDisabled();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("prefers an explicit accessibilityLabel", async () => {
    await render(<Button label="Buy" accessibilityLabel="Buy Studio pack" />);
    expect(screen.getByRole("button", { name: "Buy Studio pack" })).toBeOnTheScreen();
  });
});
