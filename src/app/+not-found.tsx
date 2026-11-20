// A link the app has no screen for (a development route in a Release build, a mistyped link) goes to Cards instead of
// Expo Router's generic "Unmatched Route" page with its Sitemap link (REVIEW_V1 S7, seen on the P9 Release build).
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/" />;
}
