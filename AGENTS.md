# Expo SDK version

This project runs **Expo SDK 54** (`expo@54.x`, React Native 0.81, React 19.1).
The shipped Android APK (`Kadi-v1.0.1.apk`) was built on SDK 54.

Read the versioned docs at https://docs.expo.dev/versions/v54.0.0/ before
writing client code, and pin native deps with `expo install <pkg>` (online, so
versions resolve to SDK 54 — do NOT use `EXPO_OFFLINE=1`, it pulls mismatched
latest packages).

A future upgrade to a newer SDK is possible but is its own task (bump
expo/react-native/react + deps, fix breakage, re-test the game and APK build).
