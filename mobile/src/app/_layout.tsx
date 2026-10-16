import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";
import { CompanionForegroundWatcher } from "../components/CompanionForegroundWatcher";

export default function RootLayout() {
  return <>
    <CompanionForegroundWatcher />
    <StatusBar style="dark" />
    <Stack screenOptions={{
      headerStyle:{backgroundColor:theme.cream},
      headerTintColor:theme.green,
      headerTitleStyle:{fontWeight:"700"},
      contentStyle:{backgroundColor:theme.cream},
    }}>
      <Stack.Screen name="index" options={{title:"KONTA MOY"}} />
      <Stack.Screen name="nearby" options={{title:"Κοντά μου"}} />
      <Stack.Screen name="account" options={{title:"Ο λογαριασμός μου"}} />
      <Stack.Screen name="lists" options={{title:"Οι λίστες μου"}} />
    </Stack>
  </>;
}
