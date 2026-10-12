import { useLocalSearchParams } from "expo-router";
import { Placeholder } from "@/navigation/Placeholder";

export default function Screen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return <Placeholder id="BN-Insights" detail={`project ${projectId}`} />;
}
