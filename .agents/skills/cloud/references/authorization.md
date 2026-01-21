# Cloud Authorization

Authentication and authorization patterns for assistant-cloud.

## Auth Methods

| Method | Use Case | Security |
|--------|----------|----------|
| JWT Token | Production apps | High |
| API Key | Server-side only | Medium |
| Anonymous | Public demos | Low |

## JWT Token Authentication

Recommended for production. Token is fetched dynamically.

### Setup

```tsx
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => {
    // Return your JWT token
    const token = await getAuthToken();
    return token;
  },
});
```

### With NextAuth

```tsx
import { useSession } from "next-auth/react";

function Chat() {
  const { data: session, status } = useSession();

  const cloud = useMemo(() => {
    if (status !== "authenticated") return null;

    return new AssistantCloud({
      baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
      authToken: async () => session.accessToken,
    });
  }, [session, status]);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
    cloud: cloud ?? undefined,
  });

  if (status === "loading") return <Loading />;
  if (!session) return <SignIn />;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

### With Clerk

```tsx
import { useAuth } from "@clerk/nextjs";

function Chat() {
  const { getToken, isSignedIn } = useAuth();

  const cloud = useMemo(() => {
    if (!isSignedIn) return null;

    return new AssistantCloud({
      baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
      authToken: async () => getToken(),
    });
  }, [isSignedIn, getToken]);

  // ...
}
```

### With Firebase

```tsx
import { useAuth } from "reactfire";

function Chat() {
  const { data: user } = useAuth();

  const cloud = useMemo(() => {
    if (!user) return null;

    return new AssistantCloud({
      baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
      authToken: async () => user.getIdToken(),
    });
  }, [user]);

  // ...
}
```

## API Key Authentication

For server-side operations only. Never expose API keys to clients.

### Server Component

```tsx
// app/api/threads/route.ts
import { AssistantCloud } from "assistant-cloud";

const cloud = new AssistantCloud({
  baseUrl: process.env.ASSISTANT_BASE_URL,
  apiKey: process.env.ASSISTANT_API_KEY,
  userId: "system",
  workspaceId: process.env.ASSISTANT_WORKSPACE_ID,
});

export async function GET() {
  const threads = await cloud.threads.list();
  return Response.json(threads);
}
```

### Per-User Operations

```tsx
// app/api/chat/threads/route.ts
import { getServerSession } from "next-auth";

export async function GET() {
  const session = await getServerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const cloud = new AssistantCloud({
    baseUrl: process.env.ASSISTANT_BASE_URL,
    apiKey: process.env.ASSISTANT_API_KEY,
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });

  const threads = await cloud.threads.list();
  return Response.json(threads);
}
```

## Anonymous Authentication

For public demos or unauthenticated access.

```tsx
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  anonymous: true,
});
```

**Limitations:**
- No user isolation
- Limited features
- No cross-device sync

## Token Refresh

Handle expired tokens:

```tsx
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => {
    const token = getStoredToken();

    if (isTokenExpired(token)) {
      const newToken = await refreshToken();
      setStoredToken(newToken);
      return newToken;
    }

    return token;
  },
});
```

## Error Handling

```tsx
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => {
    try {
      return await getToken();
    } catch (error) {
      console.error("Auth error:", error);

      // Redirect to login
      window.location.href = "/login";
      return null;
    }
  },
});
```

## Workspace Isolation

Users in different workspaces have separate data:

```tsx
const cloud = new AssistantCloud({
  baseUrl: process.env.ASSISTANT_BASE_URL,
  apiKey: process.env.ASSISTANT_API_KEY,
  userId: user.id,
  workspaceId: user.organization.id,  // Isolates data by org
});
```

## Role-Based Access

Implement in your backend:

```tsx
// app/api/threads/[id]/route.ts
export async function DELETE(req: Request, { params }) {
  const session = await getServerSession();

  // Check permissions
  const thread = await cloud.threads.get(params.id);
  if (thread.metadata.ownerId !== session.user.id) {
    if (!session.user.roles.includes("admin")) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  await cloud.threads.delete(params.id);
  return new Response(null, { status: 204 });
}
```

## Environment Setup

```env
# .env.local (client-side accessible)
NEXT_PUBLIC_ASSISTANT_BASE_URL=https://api.assistant-ui.com

# .env (server-side only)
ASSISTANT_BASE_URL=https://api.assistant-ui.com
ASSISTANT_API_KEY=your-secret-key
ASSISTANT_WORKSPACE_ID=your-workspace
```

## Security Best Practices

1. **Never expose API keys** - Use JWT tokens for client-side
2. **Validate tokens server-side** - Don't trust client tokens blindly
3. **Use short-lived tokens** - Implement refresh flow
4. **Scope workspaces** - Isolate user data by workspace
5. **Audit access** - Log thread operations for compliance
