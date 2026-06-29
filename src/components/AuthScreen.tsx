import AuthPanel from "#/components/AuthPanel";
import ThinkExLogo from "#/components/ThinkExLogo";

interface AuthScreenProps {
	callbackURL: string;
}

export default function AuthScreen({ callbackURL }: AuthScreenProps) {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<main className="flex min-h-screen items-center justify-center p-6 sm:p-10">
				<div className="flex w-full max-w-md flex-col items-center gap-8 px-8 text-center sm:px-12">
					<ThinkExLogo size={36} />
					<h1 className="text-2xl font-medium tracking-tight">Continue to ThinkEx</h1>
					<div className="w-full">
						<AuthPanel callbackURL={callbackURL} />
					</div>
				</div>
			</main>
		</div>
	);
}
