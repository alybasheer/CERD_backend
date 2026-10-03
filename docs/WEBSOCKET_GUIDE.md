// ============================================
// WEBSOCKET CHAT SYSTEM - TESTING GUIDE
// ============================================

// 1. WebSocket Connection
// Connect using Socket.IO client library
// const socket = io('http://localhost:3000', {
//   auth: {
//     token: 'your_jwt_token_here'
//   }
// });

// 2. WebSocket Events

// ============ SENDING MESSAGES ============
// Send a message to another volunteer
socket.emit('send_message', {
  receiverId: 'target_volunteer_user_id',
  content: 'Hello! How are you?'
});

// Listen for message sent confirmation
socket.on('message_sent', (data) => {
  console.log('Message sent:', data);
  // Response: { _id, receiverId, content, timestamp, status: 'delivered' or 'saved' }
});

// Listen for incoming messages
socket.on('receive_message', (data) => {
  console.log('New message:', data);
  // Response: { _id, senderId, receiverId, content, timestamp, isRead }
});

// ============ LOADING CONVERSATION ============
// Load conversation history with another user
socket.emit('get_conversation', {
  otherUserId: 'target_volunteer_user_id',
  limit: 50  // optional
});

// Listen for conversation data
socket.on('conversation_data', (data) => {
  console.log('Conversation:', data);
  // Response: { otherUserId, messages: [...], totalMessages }
});

// ============ TYPING INDICATOR ============
// Notify when typing
socket.emit('typing', {
  receiverId: 'target_volunteer_user_id',
  isTyping: true
});

// Listen for typing indicator
socket.on('user_typing', (data) => {
  console.log('User is typing:', data);
  // Response: { senderId, isTyping }
});

// ============ CONNECTION EVENTS ============
// Connection successful
socket.on('connection_success', (data) => {
  console.log('Connected:', data);
  // Response: { message, userId }
});

// Errors
socket.on('error', (data) => {
  console.error('Error:', data.message);
});

// ============================================
// REST API ENDPOINTS (for fetching history)
// ============================================

// 1. Get conversation history
GET /chat/conversation/:otherUserId?limit=50
Headers: Authorization: Bearer <token>
Response:
{
  "success": true,
  "data": {
    "userId": "...",
    "otherUserId": "...",
    "messageCount": 5,
    "messages": [...]
  }
}

// 2. Get all conversations for user
GET /chat/conversations
Headers: Authorization: Bearer <token>
Response:
{
  "success": true,
  "data": {
    "userId": "...",
    "conversationCount": 3,
    "conversations": [
      {
        "_id": "other_user_id",
        "user": { "_id", "username", "email" },
        "lastMessage": { "content", "timestamp", "isRead", "senderId" }
      }
    ]
  }
}

// 3. Get unread message count
GET /chat/unread-count
Headers: Authorization: Bearer <token>
Response:
{
  "success": true,
  "data": {
    "userId": "...",
    "unreadCount": 5
  }
}

// 4. Mark messages as read
GET /chat/mark-read/:senderId
Headers: Authorization: Bearer <token>
Response:
{
  "success": true,
  "message": "Messages from {senderId} marked as read"
}

// ============================================
// FEATURES
// ============================================

✅ Real-time messaging between volunteers
✅ Message persistence in MongoDB
✅ Typing indicators
✅ Read/unread status
✅ Offline message saving
✅ Conversation history
✅ Multiple concurrent conversations
✅ Message delivery status

// ============================================
// HOW IT WORKS
// ============================================

1. User connects via WebSocket with JWT token
2. System stores user socket ID in memory map
3. When sending message:
   - Message is saved to database
   - If receiver is online, message is emitted to their socket
   - If receiver is offline, message is saved for later retrieval
4. When receiver comes online:
   - They can fetch conversation history via REST API
   - They'll receive new messages in real-time
5. Messages are marked as read when conversation is opened
