COMPLETE BACKEND + FRONTEND FLOW
================================

## PART 1: AUTHENTICATION FLOW

### Step 1: User Sign Up (Email/Password)
┌─────────────────────────────────────────┐
│ USER SIGN UP                            │
└─────────────────────────────────────────┘

ENDPOINT: POST http://localhost:3000/authentication/signup
METHOD: POST
HEADERS: Content-Type: application/json

REQUEST BODY:
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword123"
}

RESPONSE (200 OK):
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "user_123",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2024-12-05T10:00:00Z"
  }
}

✅ SAVE: access_token (store securely in mobile)
✅ SAVE: user._id (you'll need this later)


### Step 2: User Login (Email/Password)
┌─────────────────────────────────────────┐
│ USER LOGIN                              │
└─────────────────────────────────────────┘

ENDPOINT: POST http://localhost:3000/authentication/login
METHOD: POST
HEADERS: Content-Type: application/json

REQUEST BODY:
{
  "email": "john@example.com",
  "password": "securepassword123"
}

RESPONSE (200 OK):
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "user_123",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "user"
  }
}

✅ SAVE: access_token


### Step 3: User Login with Google (OAuth)
┌─────────────────────────────────────────┐
│ GOOGLE OAUTH LOGIN                      │
└─────────────────────────────────────────┘

ENDPOINT: POST http://localhost:3000/authentication/google-login
METHOD: POST
HEADERS: Content-Type: application/json

REQUEST BODY:
{
  "email": "john@gmail.com",
  "username": "john_doe",
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2MjM0NTY3ODkifQ..."
}

RESPONSE (200 OK):
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "user_456",
    "username": "john_doe",
    "email": "john@gmail.com",
    "role": "user",
    "googleId": "eyJhbGciOiJSUzI1NiIs..."
  }
}

✅ SAVE: access_token (same as email/password login)


### Step 4: Capture Location (After Login/Signup)
┌─────────────────────────────────────────┐
│ SEND USER LOCATION                      │
└─────────────────────────────────────────┘

ENDPOINT: POST http://localhost:3000/authentication/location
METHOD: POST
HEADERS: 
  - Content-Type: application/json
  - Authorization: Bearer <your_access_token>

REQUEST BODY:
{
  "latitude": 24.8607,
  "longitude": 67.0011
}

RESPONSE (200 OK):
{
  "_id": "user_123",
  "username": "john_doe",
  "email": "john@example.com",
  "location": {
    "latitude": 24.8607,
    "longitude": 67.0011
  },
  "createdAt": "2024-12-05T10:00:00Z",
  "updatedAt": "2024-12-05T10:05:00Z"
}

✅ Location saved! User now has coordinates stored.


## PART 2: VOLUNTEER APPLICATION FLOW

### Step 5: Apply as Volunteer
┌─────────────────────────────────────────┐
│ SUBMIT VOLUNTEER APPLICATION            │
└─────────────────────────────────────────┘

ENDPOINT: POST http://localhost:3000/volunteer/apply
METHOD: POST
HEADERS:
  - Content-Type: application/json
  - Authorization: Bearer <your_access_token>

REQUEST BODY:
{
  "name": "John Doe",
  "city": "Karachi",
  "location": "Gulshan",
  "expertise": "Teaching, Coaching",
  "reason": "Want to help community",
  "cnic": "12345-6789012-3",
  "image": "https://example.com/photo.jpg" (optional)
}

RESPONSE (200 OK):
{
  "success": true,
  "message": "Application submitted successfully",
  "data": {
    "_id": "app_123",
    "userId": "user_123",
    "name": "John Doe",
    "city": "Karachi",
    "location": "Gulshan",
    "expertise": "Teaching, Coaching",
    "reason": "Want to help community",
    "cnic": "12345-6789012-3",
    "status": "pending",
    "createdAt": "2024-12-05T10:10:00Z"
  }
}

✅ Application submitted with status "pending"
✅ Admin will review and approve/reject


### Step 6: Check Your Volunteer Status
┌─────────────────────────────────────────┐
│ GET YOUR VOLUNTEER STATUS               │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/volunteer/status
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

RESPONSE (200 OK):
{
  "status": "success",
  "data": {
    "_id": "app_123",
    "userId": "user_123",
    "name": "John Doe",
    "status": "approved", // or "pending", "rejected"
    "createdAt": "2024-12-05T10:10:00Z",
    "updatedAt": "2024-12-05T11:00:00Z"
  }
}

OR if no application:
{
  "status": "success",
  "data": {
    "status": "pending",
    "message": "No application found. User can submit a new application."
  }
}


## PART 3: CHAT & MESSAGING FLOW

### Step 7: List All Volunteers (Browse Directory)
┌─────────────────────────────────────────┐
│ BROWSE ALL VOLUNTEERS                   │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/volunteers/list
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

OPTIONAL QUERY PARAMS:
  - search=ali (search by name/email)
  - limit=50 (max results)

EXAMPLE: http://localhost:3000/chat/volunteers/list?search=ali&limit=50

RESPONSE (200 OK):
{
  "success": true,
  "data": {
    "currentUserId": "user_123",
    "volunteerCount": 3,
    "volunteers": [
      {
        "_id": "vol_456",
        "username": "ali_volunteer",
        "email": "ali@example.com",
        "role": "volunteer",
        "createdAt": "2024-12-01T10:00:00Z"
      },
      {
        "_id": "vol_789",
        "username": "alina_helper",
        "email": "alina@example.com",
        "role": "volunteer",
        "createdAt": "2024-12-02T11:30:00Z"
      }
    ]
  }
}

✅ You now have list of volunteers to message!


### Step 8: Get Volunteer Profile
┌─────────────────────────────────────────┐
│ VIEW VOLUNTEER PROFILE                  │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/volunteers/:volunteerId
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

EXAMPLE: http://localhost:3000/chat/volunteers/vol_456

RESPONSE (200 OK):
{
  "success": true,
  "data": {
    "_id": "vol_456",
    "username": "ali_volunteer",
    "email": "ali@example.com",
    "role": "volunteer",
    "createdAt": "2024-12-01T10:00:00Z"
  }
}

✅ See volunteer details before messaging


### Step 9: Load Existing Conversations
┌─────────────────────────────────────────┐
│ GET ALL CONVERSATIONS                   │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/conversations
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

RESPONSE (200 OK):
{
  "success": true,
  "data": {
    "userId": "user_123",
    "conversationCount": 2,
    "conversations": [
      {
        "_id": "vol_456",
        "user": {
          "_id": "vol_456",
          "username": "ali_volunteer",
          "email": "ali@example.com"
        },
        "lastMessage": {
          "content": "Hey! How are you?",
          "timestamp": "2024-12-05T10:30:00Z",
          "isRead": false,
          "senderId": "vol_456"
        }
      }
    ]
  }
}

✅ See all active conversations with last message


### Step 10: Load Chat History
┌─────────────────────────────────────────┐
│ GET CHAT HISTORY WITH SPECIFIC USER     │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/conversation/:volunteerId?limit=50
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

EXAMPLE: http://localhost:3000/chat/conversation/vol_456?limit=50

RESPONSE (200 OK):
{
  "success": true,
  "data": {
    "userId": "user_123",
    "otherUserId": "vol_456",
    "messageCount": 5,
    "messages": [
      {
        "_id": "msg_1",
        "senderId": "user_123",
        "receiverId": "vol_456",
        "content": "Hi Ali!",
        "isRead": true,
        "timestamp": "2024-12-05T09:00:00Z"
      },
      {
        "_id": "msg_2",
        "senderId": "vol_456",
        "receiverId": "user_123",
        "content": "Hey! How are you?",
        "isRead": false,
        "timestamp": "2024-12-05T09:05:00Z"
      }
    ]
  }
}

✅ Full chat history loaded in chronological order


### Step 11: Check Unread Messages
┌─────────────────────────────────────────┐
│ GET UNREAD MESSAGE COUNT                │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/unread-count
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

RESPONSE (200 OK):
{
  "success": true,
  "data": {
    "userId": "user_123",
    "unreadCount": 3
  }
}

✅ Show badge with "3" unread messages


### Step 12: Mark Messages as Read
┌─────────────────────────────────────────┐
│ MARK ALL MESSAGES AS READ               │
└─────────────────────────────────────────┘

ENDPOINT: GET http://localhost:3000/chat/mark-read/:senderId
METHOD: GET
HEADERS:
  - Authorization: Bearer <your_access_token>

EXAMPLE: http://localhost:3000/chat/mark-read/vol_456

RESPONSE (200 OK):
{
  "success": true,
  "message": "Messages from vol_456 marked as read"
}

✅ Conversation marked as read, badge removed


### Step 13: REAL-TIME MESSAGING (WebSocket)
┌─────────────────────────────────────────┐
│ CONNECT TO WEBSOCKET & SEND MESSAGES    │
└─────────────────────────────────────────┘

1️⃣ CONNECT (on app startup):
```javascript
const socket = io('http://<backend-ip>:3000', {
  auth: { token: '<your_access_token>' }
});

socket.on('connection_success', (data) => {
  console.log('Connected!', data);
  // { message: "Connected to chat server", userId: "user_123" }
});
```

2️⃣ SEND MESSAGE:
```javascript
socket.emit('send_message', {
  receiverId: 'vol_456',
  content: 'Hello Ali! Are you there?'
});

socket.on('message_sent', (data) => {
  console.log('Message confirmed:', data);
  // { _id, receiverId, content, timestamp, status: 'delivered' }
});
```

3️⃣ RECEIVE MESSAGE (real-time):
```javascript
socket.on('receive_message', (data) => {
  console.log('New message:', data);
  // { _id, senderId, receiverId, content, timestamp, isRead }
});
```

4️⃣ TYPING INDICATOR:
```javascript
// When user starts typing
socket.emit('typing', {
  receiverId: 'vol_456',
  isTyping: true
});

// When other user is typing
socket.on('user_typing', (data) => {
  console.log('User is typing:', data.isTyping);
});
```

5️⃣ LOAD CONVERSATION (via WebSocket):
```javascript
socket.emit('get_conversation', {
  otherUserId: 'vol_456',
  limit: 50
});

socket.on('conversation_data', (data) => {
  console.log('All messages:', data);
  // { otherUserId, messages: [...], totalMessages }
});
```


## COMPLETE USER JOURNEY

┌──────────────────────────────────────────────────┐
│ NEW USER FLOW                                    │
└──────────────────────────────────────────────────┘

1. User opens app
   ↓
2. User clicks "Sign Up" 
   → POST /authentication/signup (email/password)
   ↓
3. App stores access_token
   ↓
4. App asks for location permission
   → POST /authentication/location (coordinates)
   ↓
5. User goes to Volunteer form
   → POST /volunteer/apply (submit application)
   ↓
6. User sees "Pending Approval"
   → GET /volunteer/status (check status)
   ↓
7. Admin approves ✅
   → User role changes to 'volunteer'
   ↓
8. User browses other volunteers
   → GET /chat/volunteers/list (see all)
   ↓
9. User clicks on volunteer
   → GET /chat/volunteers/:id (view profile)
   ↓
10. User clicks "Message"
    → WebSocket connect
    → socket.emit('send_message')
    ↓
11. Other volunteer receives real-time message
    → socket.on('receive_message')
    ↓
12. Real-time chat continues with typing indicators
    → socket.emit('typing')
    → socket.on('user_typing')


## POSTMAN TESTING ORDER

1. ✅ POST /authentication/signup → Get access_token
2. ✅ POST /authentication/location → Save location
3. ✅ GET /volunteer/status → Check status (pending)
4. ✅ POST /volunteer/apply → Submit application
5. ✅ GET /volunteer/status → Check status (pending/approved)
6. ✅ GET /chat/volunteers/list → Browse volunteers
7. ✅ GET /chat/volunteers/:id → View volunteer
8. ✅ GET /chat/conversations → See all chats
9. ✅ GET /chat/conversation/:id → Load history
10. ✅ GET /chat/unread-count → Check unread
11. ✅ GET /chat/mark-read/:id → Mark as read
12. ✅ Connect WebSocket & test real-time messaging


## KEY POINTS TO REMEMBER

✅ Always include: Authorization: Bearer <token> in headers
✅ Store token securely on mobile (flutter_secure_storage)
✅ Replace <backend-ip> with your machine IP (e.g., 192.168.1.100)
✅ Use http:// for local testing (https:// for production)
✅ WebSocket needs token in auth during connection
✅ All responses have "success" field (true/false)
✅ Use access_token value, not the whole bearer header
✅ Test REST endpoints first, then WebSocket
