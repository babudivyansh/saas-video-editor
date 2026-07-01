import { Select } from "@clipiro/ui";

export function Default() {
  return (
    <div style={{ maxWidth: 280 }}>
      <Select
        label="Export resolution"
        defaultValue="1080p"
        options={[
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p (recommended)" },
          { value: "4k", label: "4K" },
        ]}
      />
    </div>
  );
}

export function ErrorState() {
  return (
    <div style={{ maxWidth: 280 }}>
      <Select
        label="Payout method"
        error="Add a payout method to continue"
        options={[
          { value: "", label: "Select a method" },
          { value: "upi", label: "UPI" },
          { value: "bank", label: "Bank transfer" },
        ]}
      />
    </div>
  );
}
