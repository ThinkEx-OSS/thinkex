import * as React from 'react';

interface InviteEmailTemplateProps {
    inviterName?: string;
    workspaceName: string;
    workspaceUrl: string;
}

export function InviteEmailTemplate({
    inviterName,
    workspaceName,
    workspaceUrl,
}: Readonly<InviteEmailTemplateProps>): React.ReactElement {
    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px', color: '#333' }}>
            <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>
                You've been invited to collaborate!
            </h1>
            <p style={{ fontSize: '16px', lineHeight: '1.5' }}>
                <strong>{inviterName || 'Someone'}</strong> has invited you to collaborate on the workspace <strong>{workspaceName}</strong>.
            </p>
            <div style={{ marginTop: '24px', marginBottom: '24px' }}>
                <a
                    href={workspaceUrl}
                    style={{
                        backgroundColor: '#000',
                        color: '#fff',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '16px',
                        display: 'inline-block',
                    }}
                >
                    Join Workspace
                </a>
            </div>
            <p style={{ fontSize: '14px', color: '#666' }}>
                or copy and paste this link into your browser: <br />
                <a href={workspaceUrl} style={{ color: '#0070f3', wordBreak: 'break-all' }}>
                    {workspaceUrl}
                </a>
            </p>
        </div>
    );
}

export default InviteEmailTemplate;
