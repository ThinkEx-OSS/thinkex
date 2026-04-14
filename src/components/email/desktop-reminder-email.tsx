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
} from "@react-email/components";

export function DesktopReminderEmail() {
  return (
    <Html>
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
        <Preview>Open ThinkEx on your desktop to get started</Preview>
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
              src="https://thinkex.app/email-logo.png"
              width="40"
              height="40"
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
            Continue on your desktop
          </Heading>
          <Text
            style={{ fontSize: "14px", lineHeight: "24px", color: "#525f7f" }}
          >
            ThinkEx works best on a desktop or laptop computer. Click the button
            below to open ThinkEx and start organizing your knowledge.
          </Text>
          <Section
            style={{
              textAlign: "center",
              marginTop: "32px",
              marginBottom: "32px",
            }}
          >
            <Button
              href="https://thinkex.app"
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
              Open ThinkEx
            </Button>
          </Section>
          <Text
            style={{ fontSize: "14px", lineHeight: "24px", color: "#525f7f" }}
          >
            or visit:{" "}
            <Link
              href="https://thinkex.app"
              style={{ color: "#556cd6", textDecoration: "none" }}
            >
              thinkex.app
            </Link>
          </Text>
          <Hr style={{ border: "1px solid #eaeaea", margin: "26px 0" }} />
          <Text
            style={{
              fontSize: "12px",
              lineHeight: "24px",
              color: "#8898aa",
              fontStyle: "italic",
            }}
          >
            The Workspace That Thinks With You
          </Text>
          <Text
            style={{ fontSize: "11px", color: "#8898aa", marginTop: "12px" }}
          >
            © {new Date().getFullYear()} ThinkEx
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DesktopReminderEmail;
