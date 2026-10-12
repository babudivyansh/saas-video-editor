import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextField } from "../TextField";

describe("TextField", () => {
  it("labels the input with its visible label and reports typing", async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Email" value="" onChangeText={onChangeText} />);
    expect(screen.getByText("Email")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Email"), "maya@creatorlab.co");
    expect(onChangeText).toHaveBeenCalledWith("maya@creatorlab.co");
  });

  it("shows helper text, and an error replaces it", async () => {
    const { rerender } = await render(<TextField label="Password" helper="At least 8 characters, with one number." />);
    expect(screen.getByText("At least 8 characters, with one number.")).toBeOnTheScreen();

    await rerender(<TextField label="Password" helper="At least 8 characters, with one number." error="Too short." />);
    expect(screen.getByText("Too short.")).toBeOnTheScreen();
    expect(screen.queryByText("At least 8 characters, with one number.")).toBeNull();
    // The error is also attached to the input for screen readers.
    expect(screen.getByLabelText("Password").props.accessibilityHint).toBe("Too short.");
  });

  it("runs the trailing action from a labelled button", async () => {
    const onPress = jest.fn();
    await render(
      <TextField label="Password" secureTextEntry trailingAction={{ icon: "eye", accessibilityLabel: "Show password", onPress }} />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("forwards focus and blur", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<TextField label="Email" onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByLabelText("Email");
    await fireEvent(input, "focus");
    await fireEvent(input, "blur");
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
