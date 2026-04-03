import React from "react";
import LoginScreen from "./LoginScreen";

export default function App() {
  const handleLoginSuccess = () => {
    // Add post-login behavior here.
  };

  return (
    <>
      {/* <ChatScreen /> */}
      <LoginScreen onLoginSuccess={handleLoginSuccess} />
    </>
  );
}
