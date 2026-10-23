# MindMatch — Warm Vintage

Stitch project: `projects/16885496399031899203` (MindMatch Social Discovery UI).

## Theme

| Token | Light | Dark |
| --- | --- | --- |
| Page | `#FFFFFF` | `#000000` |
| Surface | `#F7F8F3` | `#141610` |
| Primary | `#C9C18E` | `#ADA77D` |
| Text | `#282A25` | `#E9ECE2` |
| Secondary | `#74776D` | `#A1A599` |

Shared palette: `src/theme/tokens.ts`. Appearance preference follows the system by default and can be changed in Settings → Preferences → Appearance.

## Stitch references

Screen resources use the project prefix above followed by `/screens/`.

| Screen | Resource ID | Implementation |
| --- | --- | --- |
| Discover (public profile list) | `46446e34dae44c97b107be278f3334f3` | `src/app/(tabs)/index.tsx` |
| Public profile | `fc304868b8814c21b2eeb81fe8d37477` | `src/app/user/[id].tsx` |
| Chats | `1b62277c3e3a4e939bb7bf581f1db827` | `src/app/(tabs)/chats.tsx` |
| Profile & preferences | `3fed0f5ed794427290676598550e43cf` | `src/app/(tabs)/profile.tsx`, `src/app/settings.tsx` |
| Conversation | `84d09bee31944297b3eccbad23771e35` | `src/app/conversation/[id].tsx` |
| Notifications | `ac321b73b4924115bb491af074a7d467` | `src/app/notifications.tsx` |
| Login | `147980b49e924d04bc65e87e7545050c` | `src/app/index.tsx` |
| Mood | `69a94ec7abbf4125a782c6d14bccc752` | `src/app/mood.tsx` |
| Stories | `df38f42527ad4a719b4173ed29a691f9` | `src/app/(tabs)/stories.tsx` |
| Call | `0b2d8348f85140109c222666de495228` | `src/app/call/[id].tsx` |

These are design references, not screenshots of the running application. Sample people, verification, distance, encryption claims, filters and purchase features in generated mockups are not added without backend support. The application retains its existing mood enum and mascot family. Story drafts use selected media and an explicit Share action.

Source review only; no build, tests or device verification were performed, as requested.

## Navigation update

Discover presents public profiles as a compact conversation-style list. Matches (`src/app/(tabs)/matches.tsx`) presents only backend-confirmed similar moods as full-height vertically paged portraits. Story creation/feed remains accessible from the story rail in Chats; Stories is hidden from the main tab bar. Public request/call preferences are redacted by the backend, so those values are not used as client capability flags. Recipient permissions are enforced by the request and call endpoints.

## Muted yellow refinement

One desaturated vintage yellow replaces orange/brown accents throughout the shared theme. No gradient components remain. Small floating identity/media controls use `SoftSurface`, backed by the installed iOS native glass module when supported and transparency is enabled; other platforms use a translucent fallback. Reduced transparency gets an opaque surface; entrance fades honor reduced motion. Chat identity is in normal layout flow, loads the real profile photo, truncates long names and keeps actions separate from messages.
