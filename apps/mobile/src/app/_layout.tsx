import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from "@expo-google-fonts/geist-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components";
import { useSession } from "@/state/session";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();
// Dark-only app: paint the native root view so no white flashes between screens.
SystemUI.setBackgroundColorAsync(colors.bg);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const signedIn = useSession((s) => s.signedIn);
  const ready = useSession((s) => s.ready);
  const [loaded, error] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  // Read the saved session behind the splash, so a signed-in user opens
  // straight into the tabs and never sees onboarding.
  useEffect(() => {
    useSession.getState().hydrate();
  }, []);

  // However the session ended (log out, or a refresh the server refused),
  // nothing cached for that account may show to the next one.
  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn, queryClient]);

  useEffect(() => {
    if ((loaded || error) && ready) SplashScreen.hideAsync();
  }, [loaded, error, ready]);

  // On a font error, render anyway with the system font rather than hang on the splash.
  if ((!loaded && !error) || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              {/* Signed out: splash → onboarding → auth. When the session flips,
                  this side's history is dropped and the router lands on the first
                  available screen — so Android back can't cross the line. */}
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" />
                {/* Full-screen modals over the tabs (SCREENS.md "Navigation"). */}
                <Stack.Screen name="editor" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="composer" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="assistant" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
              </Stack.Protected>
              <Stack.Screen name="dev/components" />
            </Stack>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
