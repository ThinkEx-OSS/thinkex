import AuthPanel, { AuthLegalNotice } from "#/components/AuthPanel";
import AuthPageLayout from "#/components/AuthPageLayout";

interface AuthScreenProps {
	callbackURL: string;
}

export default function AuthScreen({ callbackURL }: AuthScreenProps) {
	return (
		<AuthPageLayout footer={<AuthLegalNotice />}>
			<h1 className="text-2xl font-medium tracking-tight">Continue to ThinkEx</h1>
			<div className="w-full">
				<AuthPanel callbackURL={callbackURL} showLegalNotice={false} />
			</div>
		</AuthPageLayout>
	);
}
