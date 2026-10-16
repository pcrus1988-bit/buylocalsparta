import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";

export default function RootLayout() {
  return <>
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
    </Stack>
  </>;
}
