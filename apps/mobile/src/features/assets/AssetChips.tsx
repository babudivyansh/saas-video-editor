import { ASSET_FILTERS, type AssetFilter } from "@clipiro/shared";
import { router } from "expo-router";
import { FilterPills } from "@/components";

// Assets' chips. All / Videos / Images filter the main screen in place; Audio
// and AI Assets are their own screens (design: BN-AssetsAudio, BN-AssetsAI).
export function AssetChips({ value, onChange }: { value: AssetFilter; onChange?: (f: AssetFilter) => void }) {
  return (
    <FilterPills
      accessibilityLabel="Show"
      options={ASSET_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
      value={value}
      onChange={(next) => {
        if (next === value) return;
        if (next === "audio") return value === "ai" ? router.replace("/projects/assets/audio") : router.push("/projects/assets/audio");
        if (next === "ai") return value === "audio" ? router.replace("/projects/assets/ai-assets") : router.push("/projects/assets/ai-assets");
        if (onChange) return onChange(next);
        router.dismissTo({ pathname: "/projects/assets", params: { show: next } });
      }}
    />
  );
}
