# Fanvue API v2025-06-26 — Cheatsheet

All requests require:
```
Authorization: Bearer <token>
X-Fanvue-API-Version: 2025-06-26
Content-Type: application/json  (for POST/PATCH)
```

Prices are in **cents** (5000 = $50.00, 999 = $9.99).

---

## Media Upload (3-phase multipart)

### Phase 1: Create session
```
POST /media/uploads
Body: { "name": "string", "filename": "string", "mediaType": "image"|"video"|"audio" }
Response: { "mediaUuid": "uuid", "uploadId": "string" }
```

### Phase 2: Get signed URL + PUT chunk
```
GET /media/uploads/{uploadId}/parts/{partNumber}/url
Response: "https://s3.amazonaws.com/..." (JSON string)

PUT <signedUrl>  (raw bytes, no Content-Type header if SignedHeaders=host only)
Response headers: ETag: "abc123..."
```

### Phase 3: Complete upload
```
PATCH /media/uploads/{uploadId}
Body: { "parts": [{ "PartNumber": 1, "ETag": "\"abc123...\"" }] }
Response: { "status": "processing" }
```

### Poll until ready
```
GET /media/{mediaUuid}
Response: { "uuid": "...", "status": "created"|"processing"|"ready"|"error" }
```

---

## Posts

### Create a post
```
POST /posts
Body: {
  "text": "Check out my latest content!",
  "audience": "subscribers",         // "subscribers" | "followers-and-subscribers"
  "price": 999,                      // cents, optional (PPV if set)
  "mediaPreviewUuid": "uuid",        // optional preview image
  "publishAt": "2024-01-15T09:30:00Z" // optional scheduled
}
Response: {
  "uuid": "...",
  "createdAt": "...",
  "text": "...",
  "price": 999,
  "audience": "subscribers",
  "publishAt": "2024-01-15T09:30:00Z",
  "publishedAt": "..."
}
```

### Get posts
```
GET /posts
Response: { "data": [...], "pagination": { "page", "size", "hasMore" } }
```

---

## Chat / DMs

### List chats
```
GET /chats
Response: {
  "data": [{
    "createdAt": "...",
    "lastMessageAt": "...",
    "isRead": false,
    "unreadMessagesCount": 3,
    "user": {
      "uuid": "...", "handle": "...", "displayName": "...",
      "nickname": "...", "isTopSpender": true, "avatarUrl": "..."
    },
    "lastMessage": {
      "text": "...", "type": "SINGLE_RECIPIENT"|"BROADCAST"|"AUTOMATED_CANCELED",
      "uuid": "...", "sentAt": "...", "hasMedia": true, "mediaType": "image"
    }
  }],
  "pagination": { "page": 1, "size": 2, "hasMore": false }
}
```

### Get messages from a chat
```
GET /chats/{userUuid}/messages
Response: {
  "data": [{
    "uuid": "...",
    "text": "...",
    "sentAt": "...",
    "sender": { "uuid", "handle", "displayName", "isTopSpender" },
    "recipient": { "uuid", "handle", "displayName" },
    "hasMedia": true,
    "mediaType": "image",
    "mediaUuids": ["uuid1", "uuid2"],
    "type": "SINGLE_RECIPIENT",
    "pricing": { "USD": { "price": 500 } },  // cents
    "purchasedAt": "..."  // null if not purchased
  }],
  "pagination": { "page": 1, "size": 2, "hasMore": true }
}
```

### Send a message (to one user)
```
POST /chats/{userUuid}/message
Body: {
  "text": "...",
  "mediaUuids": ["uuid"],     // optional
  "price": 500                // optional PPV cents
}
Response: { "messageUuid": "..." }
```

### Send a mass message
```
POST /chats/mass-messages
Body: {
  "text": "...",
  "mediaUuids": ["uuid"],
  "price": 500               // PPV cents
  // filter/audience fields TBD
}
Response: { "id": "...", "recipientCount": 1250, "createdAt": "..." }
```

### List mass messages
```
GET /chats/mass-messages
```

---

## Media Access

### Grant consumer access to media
```
POST /media/{uuid}/grant
Body: {
  "consumerId": "user-uuid",
  "source": "spin_the_wheel_reward",  // source type
  "sourceRef": "uuid"                 // reference ID
}
Response: { "entitlementId": "...", "status": "granted" }
```

---

## Subscribers & Fans

### Get subscribers
```
GET /subscribers
Response: {
  "data": [{
    "uuid": "...", "handle": "...", "displayName": "...",
    "nickname": "...", "isTopSpender": true,
    "avatarUrl": "...", "registeredAt": "...", "role": "creator"
  }],
  "pagination": { "page": 1, "size": 2, "hasMore": false }
}
```

### Get top-spending fans
```
GET /insights/top-spenders
Response: {
  "data": [{
    "gross": 15000,   // cents
    "net": 12750,
    "messages": 342,
    "user": { "uuid", "handle", "displayName", "isTopSpender" }
  }],
  "pagination": { ... }
}
```

### Get fan insights (bulk)
```
GET /insights/fans?fanUuids=uuid1,uuid2
Response: {
  "results": {
    "uuid1": {
      "status": "subscriber",
      "spending": {
        "lastPurchaseAt": "...",
        "total": { "gross": 27700 },
        "maxSinglePayment": { "gross": 5000 },
        "sources": {
          "message": { "gross": 15000 },
          "post": { "gross": 8500 },
          "referral": { "gross": 4200 }
        }
      },
      "subscription": {
        "createdAt": "...",
        "renewsAt": "...",
        "autoRenewalEnabled": true
      }
    }
  },
  "errors": [{ "fanUuid": "...", "code": "NOT_FOUND", "message": "..." }]
}
```

---

## Earnings

### Get earnings data
```
GET /insights/earnings
Response: {
  "data": [{
    "date": "...",
    "gross": 5000,    // cents
    "net": 4250,
    "currency": "USD",
    "source": "subscription"|"tip"|"message"|"post",
    "user": { "uuid", "handle", "displayName", "isTopSpender" }
  }],
  "nextCursor": "eyJ..."  // cursor pagination (not page-based)
}
```

---

## Key Insights

- **Prices in cents** everywhere (999 = $9.99)
- **Pagination**: most use `{ page, size, hasMore }`, earnings uses cursor
- **Chat API is comprehensive** — can fully replace Substy Playwright for DM management
- **Fan insights** include spending breakdown by source → perfect for CRM segmentation
- **Top spenders** endpoint = ready-made Whale detection
- **Mass messages** support PPV pricing → direct monetization pipeline
