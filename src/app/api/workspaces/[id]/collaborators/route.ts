import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { Resend } from "resend";
import { InviteEmailTemplate } from "@/components/email/invite-email";
import {
  verifyWorkspaceAccess,
  withErrorHandling,
  requireAuth,
  requireAuthWithUserInfo,
} from "@/lib/api/workspace-helpers";
import { db } from "@/lib/db/client";
import {
  user,
  workspaceCollaborators,
  workspaceInvites,
  workspaces,
} from "@/lib/db/schema";
import { generateSecureToken } from "@/lib/utils/generate-token";

const resend = new Resend(process.env.RESEND_API_KEY);

function getAppBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}

async function sendInviteEmail(params: {
  to: string;
  inviterName: string;
  workspaceName: string;
  workspaceUrl: string;
  permissionLevel?: string;
  idempotencyKey: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send(
      {
        from: "ThinkEx <hello@thinkex.app>",
        to: [params.to],
        subject: `You've been invited to collaborate on ${params.workspaceName}`,
        react: InviteEmailTemplate({
          inviterName: params.inviterName,
          workspaceName: params.workspaceName,
          workspaceUrl: params.workspaceUrl,
          permissionLevel: params.permissionLevel,
        }),
      },
      { idempotencyKey: params.idempotencyKey },
    );

    return { sent: !error, error: error?.message };
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return { sent: false, error: String(error) };
  }
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id: workspaceId } = await paramsPromise;
  const userId = await authPromise;

  await verifyWorkspaceAccess(workspaceId, userId, "viewer");

  const [workspaceOwner] = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .leftJoin(user, eq(workspaces.userId, user.id))
    .where(eq(workspaces.id, workspaceId));

  const collaborators = await db
    .select({
      id: workspaceCollaborators.id,
      userId: workspaceCollaborators.userId,
      permissionLevel: workspaceCollaborators.permissionLevel,
      createdAt: workspaceCollaborators.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(workspaceCollaborators)
    .leftJoin(user, eq(workspaceCollaborators.userId, user.id))
    .where(eq(workspaceCollaborators.workspaceId, workspaceId));

  const invites = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      permissionLevel: workspaceInvites.permissionLevel,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
      inviterId: workspaceInvites.inviterId,
    })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.workspaceId, workspaceId));

  const ownerAsCollaborator = workspaceOwner
    ? {
        id: `owner-${workspaceOwner.userId}`,
        userId: workspaceOwner.userId,
        permissionLevel: "owner",
        createdAt: workspaceOwner.createdAt,
        name: workspaceOwner.name,
        email: workspaceOwner.email,
        image: workspaceOwner.image,
      }
    : null;

  const allCollaborators = ownerAsCollaborator
    ? [ownerAsCollaborator, ...collaborators]
    : collaborators;

  return NextResponse.json({ collaborators: allCollaborators, invites });
}

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsPromise = params;
  const authPromise = requireAuthWithUserInfo();

  const { id: workspaceId } = await paramsPromise;
  const currentUser = await authPromise;

  const body = await request.json();
  const { email, permissionLevel = "editor" } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  await verifyWorkspaceAccess(workspaceId, currentUser.userId, "editor");

  const normalizedEmail = email.trim().toLowerCase();
  const effectivePermissionLevel =
    permissionLevel === "viewer" ? "viewer" : "editor";

  const [invitedUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  const [existing] = await db
    .select({ id: workspaceCollaborators.id })
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, workspaceId),
        eq(workspaceCollaborators.userId, invitedUser?.id || "non-existent"),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { message: "User is already a collaborator" },
      { status: 409 },
    );
  }

  const [workspace] = await db
    .select({
      userId: workspaces.userId,
      name: workspaces.name,
      slug: workspaces.slug,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const workspaceName = workspace?.name || "Workspace";
  const inviterName = currentUser.name || "A user";
  const workspaceIdentifier = workspace?.slug || workspaceId;
  const appBaseUrl = getAppBaseUrl(request);

  if (invitedUser) {
    if (invitedUser.id === currentUser.userId) {
      return NextResponse.json(
        { message: "You can't invite yourself" },
        { status: 400 },
      );
    }

    if (workspace && invitedUser.id === workspace.userId) {
      return NextResponse.json(
        { message: "Cannot invite workspace owner as collaborator" },
        { status: 400 },
      );
    }

    const [newCollaborator] = await db
      .insert(workspaceCollaborators)
      .values({
        workspaceId,
        userId: invitedUser.id,
        permissionLevel: effectivePermissionLevel,
      })
      .returning();

    const emailResult = await sendInviteEmail({
      to: normalizedEmail,
      inviterName,
      workspaceName,
      workspaceUrl: `${appBaseUrl}/workspace/${workspaceIdentifier}`,
      permissionLevel: effectivePermissionLevel,
      idempotencyKey: `invite-collab-${workspaceId}-${normalizedEmail}`,
    });

    if (!emailResult.sent) {
      return NextResponse.json(
        {
          collaborator: newCollaborator,
          warning:
            "Invite created but email failed to send. The collaborator was added successfully.",
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { collaborator: newCollaborator },
      { status: 201 },
    );
  }

  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.email, normalizedEmail),
      ),
    );

  await db.insert(workspaceInvites).values({
    workspaceId,
    email: normalizedEmail,
    token,
    inviterId: currentUser.userId,
    permissionLevel: effectivePermissionLevel,
    expiresAt: expiresAt.toISOString(),
  });

  const emailResult = await sendInviteEmail({
    to: normalizedEmail,
    inviterName,
    workspaceName,
    workspaceUrl: `${appBaseUrl}/invite/claim/${token}`,
    permissionLevel: effectivePermissionLevel,
    idempotencyKey: `invite-pending-${workspaceId}-${normalizedEmail}`,
  });

  return NextResponse.json(
    {
      message: "Invitation sent to new user",
      pending: true,
      email: normalizedEmail,
      ...(emailResult.sent
        ? {}
        : {
            warning:
              "Invite created but email failed to send. You may need to resend the invitation.",
          }),
    },
    { status: 201 },
  );
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/collaborators",
);
export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/collaborators",
);
