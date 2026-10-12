import { Redirect, router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  CreditsPill,
  EmptyState,
  FilterPills,
  Header,
  IconButton,
  ListGroup,
  ListRow,
  ProgressBar,
  ScoreBadge,
  ScoreRing,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  Skeleton,
  StatTile,
  StatusBadge,
  TabBar,
  TextField,
  Tile,
  Toggle,
  useToast,
  type TabKey,
} from "@/components";
import { colors, layout, text, type } from "@/theme";

const maya = require("../../../assets/dev/creator-golden.jpg");
const marco = require("../../../assets/dev/founder-portrait.jpg");

// Every shared component in every state, for side-by-side comparison with
// design/png. Dev builds only.
export default function ComponentGallery() {
  const toast = useToast();
  const [email, setEmail] = useState("maya@creatorlab.co");
  const [password, setPassword] = useState("clipiro2026");
  const [showPw, setShowPw] = useState(false);
  const [filter, setFilter] = useState<"all" | "drafts" | "videos" | "reels" | "shorts">("all");
  const [seg, setSeg] = useState<"accounts" | "calendar" | "scheduled">("accounts");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [agree, setAgree] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<TabKey>("home");

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Header title="Components" onBack={() => router.back()} actions={<CreditsPill amount={1000} onPress={() => toast("Opens Credits")} />} />

        <Section title="Header (large)">
          <Header title="Projects" large actions={<IconButton icon="search" accessibilityLabel="Search projects" />} />
        </Section>

        <Section title="Button">
          <Button label="Start AutoClipping" icon="arrowRight" fullWidth onPress={() => toast("Primary pressed", "success")} />
          <Button label="Generating…" loading fullWidth />
          <Button label="Generate clips" disabled fullWidth />
          <Row>
            <Button label="Sync now" variant="secondary" style={styles.grow} />
            <Button label="Analytics" variant="secondary" style={styles.grow} />
          </Row>
          <Row>
            <Button label="Export" size="sm" icon="arrowRight" />
            <Button label="Write with AI" variant="secondary" icon="sparkle" iconPosition="start" />
          </Row>
          <Row>
            <Button label="Show all" variant="ghost" />
            <Button label="Cancel subscription" variant="danger" />
            <Button label="Disabled" variant="secondary" disabled />
          </Row>
        </Section>

        <Section title="IconButton">
          <Row>
            <IconButton icon="back" accessibilityLabel="Back" />
            <IconButton icon="search" accessibilityLabel="Search" />
            <IconButton icon="plus" accessibilityLabel="Add" variant="accent" size={52} iconSize={24} />
            <IconButton icon="close" accessibilityLabel="Close" variant="plain" />
            <IconButton icon="refresh" accessibilityLabel="Refresh" disabled />
          </Row>
        </Section>

        <Section title="TextField">
          <TextField label="Email" leadingIcon="mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextField
            label="Password"
            leadingIcon="lock"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            helper="At least 8 characters, with one number."
            trailingAction={{ icon: showPw ? "eyeOff" : "eye", accessibilityLabel: showPw ? "Hide password" : "Show password", onPress: () => setShowPw((v) => !v) }}
          />
          <TextField label="Full name" leadingIcon="you" value="" placeholder="Your name" error="Enter your name." />
          <TextField label="Read only" value="Studio · Yearly" editable={false} />
        </Section>

        <Section title="FilterPills / Chip">
          <FilterPills
            accessibilityLabel="Project filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "drafts", label: "Drafts" },
              { value: "videos", label: "Videos" },
              { value: "reels", label: "Reels" },
              { value: "shorts", label: "Shorts" },
            ]}
          />
        </Section>

        <Section title="SegmentedControl">
          <SegmentedControl
            accessibilityLabel="Social Studio sections"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "accounts", label: "Accounts" },
              { value: "calendar", label: "Calendar" },
              { value: "scheduled", label: "Scheduled" },
            ]}
          />
        </Section>

        <Section title="Toggle / Checkbox">
          <ListGroup>
            <ListRow first title="Autoplay previews" trailing={<Toggle value={on} onValueChange={setOn} accessibilityLabel="Autoplay previews" />} />
            <ListRow title="Upload on Wi-Fi only" subtitle="Save mobile data" trailing={<Toggle value={off} onValueChange={setOff} accessibilityLabel="Upload on Wi-Fi only" />} />
            <ListRow title="Disabled" trailing={<Toggle value onValueChange={() => {}} accessibilityLabel="Disabled toggle" disabled />} />
          </ListGroup>
          <Checkbox checked={agree} onChange={setAgree} label="I agree to Clipiro’s Terms and Privacy Policy." />
          <Checkbox checked={false} onChange={() => {}} label="Unchecked" />
        </Section>

        <Section title="Avatar">
          <Row>
            <Avatar source={maya} name="Maya Okafor" size={64} />
            <Avatar source={marco} name="Marco Diaz" size={48} />
            <Avatar source={maya} name="Maya Okafor" size={40} />
            <Avatar name="Maya Okafor" size={40} />
            <Avatar source={marco} name="Marco Diaz" size={24} />
          </Row>
        </Section>

        <Section title="StatTile">
          <Row stretch>
            <StatTile label="Images" value="18" />
            <StatTile label="Voiceovers" value="6" />
            <StatTile label="Cleanup" value="3" />
          </Row>
          <Row stretch>
            <StatTile label="Total views" value="412k" delta="+18%" />
            <StatTile label="Engagement" value="6.8%" sub="typical 4–6%" />
          </Row>
        </Section>

        <Section title="ScoreRing / ScoreBadge">
          <Row>
            <ScoreRing value={84} label="Account health" />
            <ScoreRing value={100} icon="clock" size={72} label="Clip minutes, 1,000 left" />
            <ScoreRing value={78} icon="bolt" size={72} color={colors.info} label="AI credits, 1,171 left" />
            <ScoreBadge score={92} />
            <ScoreBadge score={88} compact />
          </Row>
        </Section>

        <Section title="ProgressBar">
          <ProgressBar value={56} label="Creator level, 56%" />
          <ProgressBar value={75} height={5} color={colors.info} label="Rendering, 75%" />
          <ProgressBar value={60} height={4} color={colors.warning} label="Draft progress, 60%" />
        </Section>

        <Section title="StatusBadge">
          <Row>
            <StatusBadge label="Healthy" tone="success" />
            <StatusBadge label="Reconnect" tone="warning" />
            <StatusBadge label="Failed" tone="error" />
            <StatusBadge label="Rendering" tone="info" />
            <StatusBadge label="Manual" tone="neutral" dot={false} />
          </Row>
        </Section>

        <Section title="Card / Tile">
          <Card>
            <Text style={type(15, "semibold")}>Card</Text>
            <Text style={text.caption}>Section container — radius 24, surface2, hairline.</Text>
          </Card>
          <Card tone="accent">
            <Text style={text.label}>Creator level</Text>
            <Text style={type(17, "bold")}>Pro Creator</Text>
            <ProgressBar value={56} label="1,450 of 2,600 XP" />
          </Card>
          <Row>
            <Tile onPress={() => toast("Upload")} accessibilityLabel="Upload" style={styles.grow}>
              <Text style={type(12, "medium")}>Tile</Text>
            </Tile>
            <Tile selected onPress={() => {}} accessibilityLabel="Selected tile" style={styles.grow}>
              <Text style={type(12, "medium")}>Selected</Text>
            </Tile>
          </Row>
        </Section>

        <Section title="SectionHeader / ListRow">
          <SectionHeader title="Voiceovers" action={{ label: "My voices", onPress: () => toast("My voices") }} />
          <ListGroup>
            <ListRow first title="Why creators quit" subtitle="Natasha · 0:32" leading={<Avatar source={maya} name="Natasha" size={40} decorative />} onPress={() => {}} />
            <ListRow title="Launch teaser VO" subtitle="Dan · 0:18" leading={<Avatar source={marco} name="Dan" size={40} decorative />} trailing={<StatusBadge label="Ready" tone="success" />} />
            <ListRow title="Delete account" destructive onPress={() => {}} />
          </ListGroup>
        </Section>

        <Section title="Loading / empty / error">
          <SkeletonCard />
          <Row>
            <Skeleton width={64} height={64} rounded={999} />
            <View style={[styles.grow, { gap: 8 }]}>
              <Skeleton width="60%" />
              <Skeleton width="40%" height={12} />
            </View>
          </Row>
          <Card>
            <EmptyState icon="folder" title="No drafts yet" body="Drafts save automatically as you edit." action={{ label: "Open the editor", onPress: () => {} }} />
          </Card>
          <Card>
            <EmptyState tone="error" title="Couldn’t load projects" body="Check your connection and try again." action={{ label: "Retry", onPress: () => toast("Retrying…") }} />
          </Card>
        </Section>

        <Section title="BottomSheet / Toast">
          <Row>
            <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
            <Button label="Success toast" variant="secondary" onPress={() => toast("12 clips are ready", "success")} />
            <Button label="Error toast" variant="secondary" onPress={() => toast("Upload failed", "error")} />
          </Row>
        </Section>

        <Section title={`TabBar (active: ${tab})`}>
          <Text style={text.caption}>Pinned to the bottom of this screen.</Text>
        </Section>
      </ScrollView>

      <TabBar active={tab} onSelect={setTab} />

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Captions">
        <SegmentedControl
          accessibilityLabel="Caption position"
          value="bottom"
          onChange={() => {}}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
        <Button label="Apply" variant="secondary" fullWidth onPress={() => setSheet(false)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={text.label} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ children, stretch = false }: { children: ReactNode; stretch?: boolean }) {
  return <View style={[styles.row, stretch && { alignItems: "stretch", flexWrap: "nowrap" }]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // Bottom padding keeps the last section clear of the floating tab bar.
  content: { padding: layout.screenPadding, paddingBottom: layout.tabBar.height + layout.tabBar.inset + 40, gap: 28 },
  section: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  grow: { flexGrow: 1 },
});
