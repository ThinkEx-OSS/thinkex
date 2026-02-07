import * as React from 'react';

const FONT =
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const BRAND_FONT =
    'Outfit, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const BG = '#111113';

interface InviteEmailTemplateProps {
    inviterName?: string;
    workspaceName: string;
    workspaceUrl: string;
    permissionLevel?: string;
}

export function InviteEmailTemplate({
    inviterName,
    workspaceName,
    workspaceUrl,
    permissionLevel,
}: Readonly<InviteEmailTemplateProps>): React.ReactElement {
    const roleText = permissionLevel === 'viewer' ? 'a Viewer' : 'an Editor';

    return (
        <div style={{ backgroundColor: BG, margin: 0, padding: 0, width: '100%' }}>
            <table
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                style={{ borderCollapse: 'collapse' as const }}
            >
                <tr>
                    <td align="center" style={{ padding: '40px 5%' }}>
                        <table
                            cellPadding={0}
                            cellSpacing={0}
                            style={{
                                maxWidth: '100%',
                                width: '100%',
                                borderCollapse: 'collapse' as const,
                            }}
                        >
                            {/* Heading + Body text */}
                            <tr>
                                <td style={{ paddingTop: '32px' }}>
                                    <h1
                                        style={{
                                            fontFamily: BRAND_FONT,
                                            fontSize: '26px',
                                            fontWeight: 600,
                                            color: '#FFFFFF',
                                            lineHeight: '1.3',
                                            margin: '0 0 16px 0',
                                        }}
                                    >
                                        You&apos;re invited to collaborate!
                                    </h1>
                                    <p
                                        style={{
                                            fontFamily: FONT,
                                            fontSize: '15px',
                                            fontWeight: 400,
                                            color: '#FFFFFF',
                                            lineHeight: '1.6',
                                            margin: 0,
                                        }}
                                    >
                                        <strong style={{ color: '#FFFFFF' }}>{inviterName || 'Someone'}</strong> has invited you to join the workspace{' '}
                                        <strong style={{ color: '#FFFFFF' }}>&ldquo;{workspaceName}&rdquo;</strong>
                                        {permissionLevel ? ` as ${roleText}` : ''}.
                                    </p>
                                </td>
                            </tr>

                            {/* CTA Button */}
                            <tr>
                                <td align="center" style={{ paddingTop: '24px', paddingBottom: '24px' }}>
                                    <a
                                        href={workspaceUrl}
                                        style={{
                                            display: 'inline-block',
                                            backgroundColor: '#FFFFFF',
                                            color: '#1F1F1F',
                                            padding: '14px 40px',
                                            borderRadius: '9999px',
                                            textDecoration: 'none',
                                            fontSize: '15px',
                                            fontWeight: 600,
                                            fontFamily: FONT,
                                            textAlign: 'center' as const,
                                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                                        }}
                                    >
                                        Join Workspace
                                    </a>
                                </td>
                            </tr>

                            {/* Fallback URL */}
                            <tr>
                                <td style={{ paddingBottom: '32px' }}>
                                    <p
                                        style={{
                                            fontFamily: FONT,
                                            fontSize: '12px',
                                            color: 'rgba(255, 255, 255, 0.5)',
                                            margin: 0,
                                            lineHeight: '1.5',
                                        }}
                                    >
                                        or copy and paste this link into your browser:
                                        <br />
                                        <a
                                            href={workspaceUrl}
                                            style={{
                                                color: '#A78BFA',
                                                textDecoration: 'underline',
                                                wordBreak: 'break-all' as const,
                                                fontSize: '12px',
                                            }}
                                        >
                                            {workspaceUrl}
                                        </a>
                                    </p>
                                </td>
                            </tr>

                            {/* Footer */}
                            <tr>
                                <td style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                                    <p
                                        style={{
                                            fontFamily: FONT,
                                            fontSize: '12px',
                                            fontStyle: 'italic' as const,
                                            color: 'rgba(255, 255, 255, 0.5)',
                                            margin: '4px 0 0 0',
                                        }}
                                    >
                                        The Workspace That Thinks With You
                                    </p>
                                    <p
                                        style={{
                                            fontFamily: FONT,
                                            fontSize: '11px',
                                            color: 'rgba(255, 255, 255, 0.5)',
                                            lineHeight: '1.5',
                                            margin: '16px 0 0 0',
                                        }}
                                    >
                                        You received this email because {inviterName || 'someone'} invited you to collaborate on ThinkEx. If you believe this was sent in error, you can safely ignore this email.
                                    </p>
                                    <p
                                        style={{
                                            fontFamily: FONT,
                                            fontSize: '11px',
                                            color: 'rgba(255, 255, 255, 0.35)',
                                            margin: '12px 0 0 0',
                                        }}
                                    >
                                        &copy; {new Date().getFullYear()} ThinkEx
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    );
}

export default InviteEmailTemplate;
