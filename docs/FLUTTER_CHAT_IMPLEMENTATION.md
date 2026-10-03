FLUTTER FRONTEND - CHAT SYSTEM IMPLEMENTATION GUIDE
===================================================

You are a Flutter AI Agent tasked with implementing the chat/messaging feature for a volunteer coordination app. 

BACKEND ENDPOINTS AVAILABLE:
============================

REST API Endpoints (HTTP):
1. POST /authentication/signup
   - Body: { username, email, password }
   - Returns: { success, access_token, user }

2. POST /authentication/login
   - Body: { email, password }
   - Returns: { success, access_token, user }

3. GET /chat/conversations
   - Headers: Authorization: Bearer <token>
   - Returns: { success, data: { userId, conversationCount, conversations[] } }

4. GET /chat/conversation/:otherUserId?limit=50
   - Headers: Authorization: Bearer <token>
   - Returns: { success, data: { userId, otherUserId, messageCount, messages[] } }

5. GET /chat/unread-count
   - Headers: Authorization: Bearer <token>
   - Returns: { success, data: { userId, unreadCount } }

6. GET /chat/mark-read/:senderId
   - Headers: Authorization: Bearer <token>
   - Returns: { success, message }

WebSocket Events (Socket.IO):
1. Connection Event
   - Connect with: io.connect('http://<backend-ip>:3000', auth: { token: '<jwt_token>' })
   - Receive: connection_success event with userId

2. send_message Event
   - Emit: socket.emit('send_message', { receiverId: String, content: String })
   - Listen for: message_sent event (confirms delivery)

3. receive_message Event
   - Listen for: socket.on('receive_message', callback)
   - Data: { _id, senderId, receiverId, content, timestamp, isRead }

4. get_conversation Event
   - Emit: socket.emit('get_conversation', { otherUserId: String, limit: int })
   - Listen for: conversation_data event

5. typing Event
   - Emit: socket.emit('typing', { receiverId: String, isTyping: bool })
   - Listen for: user_typing event

YOUR TASKS:
===========

1. AUTHENTICATION SETUP
   - Create login/signup screens
   - Store JWT token securely (using flutter_secure_storage)
   - Store userId in local storage
   - Implement token refresh logic

2. CHAT LISTING SCREEN
   - On app launch, fetch conversations using REST API: GET /chat/conversations
   - Display list of volunteers with:
     * Username
     * Last message preview
     * Timestamp of last message
     * Unread message badge (red dot if isRead=false)
   - Implement pull-to-refresh
   - Navigate to chat detail on tap

3. CHAT DETAIL SCREEN
   - Load conversation history when screen opens: GET /chat/conversation/:userId
   - Display messages in chronological order:
     * User's messages on right (blue)
     * Other user's messages on left (gray)
     * Show timestamp for each message
   - Input field at bottom to type messages
   - Auto-mark messages as read when conversation opens: GET /chat/mark-read/:senderId

4. WEBSOCKET IMPLEMENTATION
   - Initialize Socket.IO connection on app startup with JWT token
   - Keep connection alive (handle reconnections)
   - Listen for real-time messages (receive_message event)
   - When user types, emit typing event
   - When user sends message via input field:
     * Emit send_message event
     * Show message optimistically (immediately)
     * Wait for message_sent confirmation
     * Update UI with actual _id and timestamp

5. TYPING INDICATOR
   - When user starts typing, emit typing event with isTyping: true
   - Debounce typing events (wait 300ms before emitting again)
   - When user stops typing (input empty), emit isTyping: false
   - Display "User is typing..." text when receiving user_typing with isTyping: true

6. UNREAD BADGE
   - Fetch unread count on app startup: GET /chat/unread-count
   - Display badge in bottom navigation bar (if using)
   - Update badge count when new message arrives
   - Clear unread on that conversation when user opens chat

IMPLEMENTATION PACKAGES NEEDED:
================================
- socket_io_client: ^2.0.1 (for WebSocket)
- http: ^1.1.0 (for REST API calls)
- flutter_secure_storage: ^9.0.0 (for JWT token storage)
- intl: ^0.18.0 (for date formatting)
- timeago: ^4.0.0 (for "5 minutes ago" formatting)

SCREEN STRUCTURE:
==================

Screen 1: Authentication
├── Login Screen
└── Signup Screen

Screen 2: Chat List Screen (Home)
├── App Bar with unread badge
├── List of conversations
│   ├── Avatar/username
│   ├── Last message preview
│   ├── Timestamp
│   └── Unread indicator (red dot)
└── Pull-to-refresh

Screen 3: Chat Detail Screen
├── App Bar with volunteer name
├── Message list (scrollable)
│   ├── Sent messages (blue, right)
│   ├── Received messages (gray, left)
│   ├── Timestamps
│   └── Read receipts
├── Typing indicator (if other user typing)
├── Message input field
└── Send button

DATA MODELS (Define in Flutter):
==================================

class Message {
  String id;
  String senderId;
  String receiverId;
  String content;
  DateTime timestamp;
  bool isRead;
}

class Conversation {
  String userId;
  String username;
  String email;
  Message lastMessage;
  DateTime lastMessageTime;
  bool hasUnread;
}

class User {
  String id;
  String username;
  String email;
  String role;
}

WORKFLOW EXPLANATION:
======================

1. User opens app → Check if token exists → If not, go to login
2. User logs in → Get token + userId → Store securely
3. App connects to WebSocket with token
4. Home screen loads conversations via REST API
5. User taps on conversation → Load chat history via REST API + Mark as read
6. WebSocket listens for incoming messages in background
7. User types message → Emit typing indicator
8. User sends message → Emit send_message → Show optimistically → Wait for confirmation
9. New message arrives from other user → receive_message event fires → Add to UI
10. Typing stops → Emit typing with isTyping: false

IMPORTANT NOTES:
=================

- Always include "Authorization: Bearer <token>" header in REST calls
- Store JWT token securely (never in plain SharedPreferences)
- Handle socket reconnection (when user switches networks)
- Debounce typing indicators to reduce network load
- Show loading indicator while fetching conversation history
- Implement proper error handling for all API calls
- Test on both Android emulator and iOS simulator
- Backend URL: http://<your-machine-ip>:3000 (not localhost from mobile)

STATE MANAGEMENT SUGGESTION:
=============================

Use Provider or Bloc pattern:
- AuthProvider: Manages login/logout, token storage
- ChatProvider: Manages conversations list, current chat, WebSocket connection
- MessageProvider: Manages individual messages, real-time updates

SECURITY CONSIDERATIONS:
=========================

1. Store JWT token in flutter_secure_storage (encrypted)
2. Validate token before each request
3. Handle token expiration with refresh logic
4. Don't log tokens or sensitive data
5. Use HTTPS in production (implement certificate pinning)
6. Validate all API responses before using

TESTING CHECKLIST:
===================

- [ ] Can login/signup successfully
- [ ] Can see list of conversations
- [ ] Can open a conversation and see history
- [ ] Can send a message and see it appear
- [ ] Can receive real-time messages from another user
- [ ] Typing indicator shows/hides correctly
- [ ] Unread badge updates correctly
- [ ] Messages marked as read when conversation opens
- [ ] WebSocket reconnects after network change
- [ ] Can test on mobile device with backend on PC (use machine IP)

EXAMPLE FLUTTER CODE STRUCTURE:
================================

lib/
├── screens/
│   ├── auth/
│   │   ├── login_screen.dart
│   │   └── signup_screen.dart
│   └── chat/
│       ├── chat_list_screen.dart
│       └── chat_detail_screen.dart
├── services/
│   ├── auth_service.dart (REST calls)
│   ├── chat_service.dart (REST calls)
│   ├── socket_service.dart (WebSocket)
│   └── storage_service.dart (Token storage)
├── models/
│   ├── user_model.dart
│   ├── message_model.dart
│   └── conversation_model.dart
├── providers/
│   ├── auth_provider.dart
│   ├── chat_provider.dart
│   └── socket_provider.dart
└── main.dart

Now implement this chat feature in Flutter following these specifications!
