import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: '#f1f1f1',
        },
        headerTintColor: '#000',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
    </Stack>
  );
}