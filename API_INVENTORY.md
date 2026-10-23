# MindMatch API inventory

Mobile API wrappers live in `src/api/mindmatch.ts`; HTTP, bearer token refresh, timeout, and error handling are in `src/api/client.ts`. Requests below use the current backend controller routes and DTO field names.

## Integrated flows

| Flow | Backend API | App surface |
| --- | --- | --- |
| Register / sign in / refresh / logout / current user | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `GET /api/auth/me` | Welcome and account form; tokens stored in SecureStore |
| Password security | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password` | Reset request/completion and authenticated password update in settings |
| Profile and visibility | `GET /api/profiles/me`, `GET /api/profiles/{userId}`, `PUT /api/profiles/me`, `PATCH /api/profiles/me/visibility?isVisible=`, `PUT /api/profiles/me/preferences` | Profile and settings |
| Photos | `GET /api/profiles/me/photos`, `GET /api/profiles/{userId}/photos`, `POST /api/media?category=1` multipart `file`, `POST /api/profiles/me/photos` `{ mediaAssetId }`, `GET /api/media/{id}` | Profile photo gallery/upload; protected authenticated images |
| Interests | `GET /api/interests` | Discovery/profile relevance display |
| Mood check-in and discovery | `POST /api/moodcheckins` `{ mood, energy, desiredConversation }`, `GET /api/moodcheckins/me/latest`, `GET /api/discovery?page&pageSize&city`, `POST /api/discovery/{id}/seen`, `POST /api/discovery/{id}/reject` | Mood setup then profile discovery |
| Match requests | `POST /api/matches` `{ receiverId }`, `GET /api/matches`, `GET /api/matches/requests`, `POST /api/matches/{id}/accept`, `/reject`, `/end` | Discovery, incoming match requests |
| Conversations and chat | `GET /api/conversations`, `GET /api/conversations/{id}/messages?pageSize=50`, `POST /api/messages` `{ conversationId, type, content, mediaAssetId }` | Conversation list, text and image chat |
| Message requests | `GET /api/message-requests/incoming`, `POST /api/message-requests/{conversationId}/accept`, `/reject` | Incoming request screen |
| Image / video stories | `POST /api/media?category=4` image or `category=5` video, `POST /api/stories` `{ mediaAssetId, mediaType, caption }`, `GET /api/stories/feed?take=30`, `/api/stories/me`, `/api/stories/{id}`, `POST /api/stories/{id}/view` | Story upload, feed, and viewer |
| Notifications | `GET /api/notifications?pageSize=50`, `POST /api/notifications/{id}/read`, `/read-all` | Notification list and unread tab marker |
| Premium entitlement | `GET /api/premium/me` | Current membership status and benefits overview |
| Reports and moderation | `POST /api/reports`, `GET /api/admin/reports?take=50`, `GET /api/admin/reports/{id}`, `POST /api/admin/reports/{id}/assign`, `/resolve`, `POST /api/admin/users/{id}/freeze`, `/activate` | Report flow and role-gated moderation queue |
| Account | `GET /api/account/status`, `POST /api/account/freeze`, `POST /api/account/activate` | Account settings |
| Calls/signaling | `POST /api/calls` `{ conversationId, type: 1 audio / 2 video }`, `POST /api/calls/{id}/answer|reject|end`, `GET /api/calls/turn-credentials`, SignalR `/hubs/calls` | Call invitation, answer/reject, end, signaling status |

## Realtime events

The messages SignalR hub at `/hubs/messages` invalidates conversation, match, request, and notification data on `MessageCreated`, `ConversationUpdated`, `MatchCreated`, `MatchAccepted`, `MessageRequestReceived`, and `NotificationReceived`. It also displays incoming-call prompts from `CallIncoming`. Call signaling hub events include `CallOffer`, `CallAnswer`, and `CallIceCandidate`.

## Backend capabilities and limits reflected in UI

- Admin API has no endpoint to enumerate or search all users. Admins/moderators can review reports and open report detail; only admins can freeze/activate reported accounts. The admin interface therefore works from the report queue.
- Premium API exposes membership status only. It has no plans, price, subscription purchase, or billing endpoint; the app does not simulate a purchase.
- Call lifecycle and SignalR signaling are integrated, but native WebRTC audio/video peer media is not included in Expo Go. Add a supported WebRTC native package and build a custom Expo development client before claiming live A/V calls.
- Story creation supports image/video assets. Chat currently exposes text and image attachments; voice/video message upload has not been surfaced in the chat UI.
- Remote push token registration/delivery is not integrated; notifications currently arrive from the authenticated API polling/SignalR path while the app is running.
- `GET /api/admin/reports/{id}/media/{mediaId}` returns protected binary evidence. It is deliberately not rendered in the mobile moderator UI until a safe media review experience is specified.
