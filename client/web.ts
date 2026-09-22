import { Linking, Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare const window: {
  paseoDesktop?: {
    opener?: {
      openUrl?: (url: string) => Promise<void>;
    };
  };
  open(url: string, target: string, features: string): unknown;
};

export async function openExternal(url: string): Promise<void> {
  if (Platform.OS === "web") {
    const openWithSystemBrowser = window.paseoDesktop?.opener?.openUrl;
    if (openWithSystemBrowser) {
      await openWithSystemBrowser(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}
