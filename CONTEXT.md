# Workspaces

Shared spaces for items and collaboration.

## Language

**Workspace**:
A bounded collection of items shared with members.
_Avoid_: project, board, space

**Workspace Member**:
A user in a workspace with exactly one role.
_Avoid_: collaborator, participant

**Workspace Role**:
Owner, Admin, Editor, or Viewer.
_Avoid_: access level, permission

**Owner**:
Created the workspace. Full control including delete and ownership transfer.
_Avoid_: creator (as role name)

**Admin**:
Edits content; manages members except Owner and other Admins.
_Avoid_: co-owner, manager

**Editor**:
Edits content; invites at Editor or Viewer.
_Avoid_: contributor

**Viewer**:
Reads content; invites at Viewer only.
_Avoid_: guest

**Workspace Invite**:
Pending membership at a role — by email or link token.
_Avoid_: share, invitation request

**Email Invite**:
Invite emailed via Worker `EMAIL` binding. Accept through `/invite/{token}`; sign-in required; not locked to the invited address (v1). Single-use token — first accept marks the invite accepted.
_Avoid_: user invite

**Invite Link**:
Multi-use URL; role set when the link is created. One active link per role; expires after seven days; new token when expired or re-sent.
_Avoid_: workspace URL, share URL

**Invite Down**:
Members may only invite at their role or below.
_Avoid_: downgrade invite

**Invite Upgrade**:
Accepting an invite never lowers an existing member's role.
_Avoid_: role sync

**Share Dialog**:
Invite by email (chip input), copy invite links, manage members.
_Avoid_: sharing modal
