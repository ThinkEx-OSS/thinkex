import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

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
}: Readonly<InviteEmailTemplateProps>) {
  const roleText = permissionLevel === "viewer" ? "a Viewer" : "an Editor";
  const previewText = `${inviterName || "Someone"} invited you to "${workspaceName}" on ThinkEx`;

  return (
    <Html lang="en">
      <Head />
      <Body
        style={{
          backgroundColor: "#f6f9fc",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: 0,
        }}
      >
        <Preview>{previewText}</Preview>
        <Container
          style={{
            backgroundColor: "#ffffff",
            margin: "40px auto",
            maxWidth: "465px",
            borderRadius: "8px",
            border: "1px solid #eaeaea",
            padding: "20px",
          }}
        >
          <Section style={{ marginTop: "32px", textAlign: "center" }}>
            <Img
              src="https://thinkex.app/thinkex-email-logo.png"
              width="120"
              height="120"
              alt="ThinkEx"
              style={{ margin: "0 auto" }}
            />
          </Section>
          <Heading
            style={{
              fontSize: "24px",
              fontWeight: "normal",
              textAlign: "center",
              margin: "30px 0",
              color: "#000",
              padding: 0,
            }}
          >
            You&apos;re invited to collaborate!
          </Heading>
          <Text
            style={{ fontSize: "14px", lineHeight: "24px", color: "#525f7f" }}
          >
            <strong style={{ color: "#000" }}>
              {inviterName || "Someone"}
            </strong>{" "}
            has invited you to join the workspace{" "}
            <strong style={{ color: "#000" }}>
              &ldquo;{workspaceName}&rdquo;
            </strong>
            {permissionLevel ? ` as ${roleText}` : ""}.
          </Text>
          <Section
            style={{
              textAlign: "center",
              marginTop: "32px",
              marginBottom: "32px",
            }}
          >
            <Button
              href={workspaceUrl}
              style={{
                backgroundColor: "#000000",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                textAlign: "center",
                padding: "12px 24px",
                display: "inline-block",
              }}
            >
              Join Workspace
            </Button>
          </Section>
          <Text
            style={{ fontSize: "14px", lineHeight: "24px", color: "#525f7f" }}
          >
            or copy and paste this link into your browser:{" "}
            <Link
              href={workspaceUrl}
              style={{
                color: "#556cd6",
                textDecoration: "none",
                wordBreak: "break-all",
              }}
            >
              {workspaceUrl}
            </Link>
          </Text>
          <Hr style={{ border: "1px solid #eaeaea", margin: "26px 0" }} />
          <Text
            style={{ fontSize: "11px", lineHeight: "16px", color: "#8898aa" }}
          >
            You received this email because {inviterName || "someone"} invited
            you to collaborate on ThinkEx. If you believe this was sent in
            error, you can safely ignore this email.
          </Text>
          <Text
            style={{ fontSize: "11px", color: "#8898aa", marginTop: "12px" }}
          >
            © {new Date().getFullYear()} ThinkEx Inc.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmailTemplate;
