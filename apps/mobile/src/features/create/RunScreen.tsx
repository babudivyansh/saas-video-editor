import { ApiError, type Job } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, Header, Icon, ProgressBar, SkeletonCard } from "@/components";
import { jobs } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { openPushSettings, registerForPush, usePush } from "@/lib/push";
import { colors, radius, type } from "@/theme";

// An AutoClip run in progress: polls the job (GET /jobs/:id) until it's done
// or failed. Not drawn in the designs; composed from the system. Leaving is
// fine — the run carries on, and a push says when the clips are ready.

const POLL_MS = 4000;

const STAGE: Record<string, { title: string; body: string }> = {
  queued: { title: "Getting ready", body: "Your run is in the queue and starts in a moment." },
  analyzing: { title: "Finding the best moments", body: "Transcribing and scoring your video for the strongest clips." },
  rendering: { title: "Rendering your clips", body: "Cutting, reframing and captioning each clip." },
};

export const runKeys = { job: (id: string) => ["job", id] as const };

export function RunScreen() {
  const insets = useSafeAreaInsets();
  const { jobId = "" } = useLocalSearchParams<{ jobId?: string }>();
  const job = useQuery({
    queryKey: runKeys.job(jobId),
    queryFn: () => jobs.get(jobId),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "done" || q.state.data.status === "failed") ? false : POLL_MS),
    // A missing run won't appear by asking again.
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/create/autoclip"));

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}>
      <Header title="AutoClip" onBack={back} />
      {job.data ? (
        <RunState job={job.data} offline={job.isRefetchError} />
      ) : job.isPending ? (
        <SkeletonCard lines={3} />
      ) : (
        <EmptyState
          tone="error"
          title={job.error instanceof ApiError && job.error.status === 404 ? "Couldn’t find this run" : "Couldn’t load this run"}
          body={apiErrorMessage(job.error)}
          action={{ label: "Try again", onPress: () => job.refetch() }}
        />
      )}
    </ScrollView>
  );
}

function RunState({ job, offline }: { job: Job; offline: boolean }) {
  const projectId = job.result?.projectId ?? job.id.replace(/^run_/, "");
  if (job.status === "done") {
    const n = job.result?.clipCount ?? 0;
    return (
      <View style={[styles.card, styles.center]} accessibilityLiveRegion="polite">
        <View style={styles.badge}>
          <Icon name="check" size={28} color={colors.emeraldBright} />
        </View>
        <Text style={[type(22, "bold"), styles.text]} accessibilityRole="header">
          {n > 0 ? `${n} clip${n === 1 ? "" : "s"} ready` : "Your clips are ready"}
        </Text>
        <Text style={[type(14, "regular", { color: colors.fgMuted }), styles.text]}>Ranked by how likely they are to perform.</Text>
        <Button label="View clips" icon="arrowRight" fullWidth onPress={() => router.replace(`/projects/${projectId}` as Href)} />
      </View>
    );
  }
  if (job.status === "failed") {
    return (
      <View style={[styles.card, styles.center]} accessibilityLiveRegion="polite">
        <View style={[styles.badge, { backgroundColor: colors.surface3, borderColor: colors.line }]}>
          <Icon name="alert" size={28} color={colors.error} />
        </View>
        <Text style={[type(22, "bold"), styles.text]} accessibilityRole="header">
          This run didn’t finish
        </Text>
        <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 }), styles.text]}>{job.error}</Text>
        <Button label="Try again" fullWidth onPress={() => router.replace("/create/autoclip")} />
      </View>
    );
  }
  const stage = STAGE[job.stage ?? job.status] ?? STAGE.queued!;
  return (
    <>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={type(12, "semibold", { color: colors.emeraldBright, tracking: 0.08 })}>{job.progress}%</Text>
        <Text style={type(20, "bold")} accessibilityRole="header">
          {stage.title}
        </Text>
        <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>{stage.body}</Text>
        <ProgressBar value={job.progress} height={8} label={`${stage.title}, ${job.progress}%`} />
        <Text style={type(12, "regular", { color: offline ? colors.warning : colors.fgSubtle })}>
          {offline ? "No connection. Showing the last update; it’ll refresh when you’re back online." : "Usually a few minutes. You can leave this screen; the run carries on."}
        </Text>
      </View>
      <PushCard />
    </>
  );
}

/** Offers push for "clips ready" at the moment it's useful, instead of at launch. */
function PushCard() {
  const permission = usePush((s) => s.permission);
  const wanted = usePush((s) => s.prefs.renderFinished);
  if (permission === "unavailable" || !wanted) return null;
  if (permission === "granted") {
    return (
      <View style={[styles.card, styles.row]}>
        <Icon name="bell" size={20} color={colors.emeraldBright} />
        <Text style={[type(14, "regular"), { flex: 1 }]}>We’ll send a notification when your clips are ready.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="bell" size={20} color={colors.emeraldBright} />
        <Text style={[type(14, "semibold"), { flex: 1 }]}>Get a notification when your clips are ready</Text>
      </View>
      {permission === "denied" ? (
        <Button label="Turn on in Android settings" variant="secondary" size="sm" fullWidth onPress={openPushSettings} />
      ) : (
        <Button label="Turn on notifications" variant="secondary" size="sm" fullWidth onPress={() => void registerForPush({ ask: true })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  center: { alignItems: "center", gap: 12, paddingVertical: 28 },
  text: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
