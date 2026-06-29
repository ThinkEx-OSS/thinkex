import { Check, Mail } from "lucide-react";

import { communityLinks, CONTACT_EMAIL } from "#/components/community-links";
import ThinkExLogo from "#/components/ThinkExLogo";
import { AnimatedIconSwap } from "#/components/ui/animated-icon-swap";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";

function FooterEmailLink() {
	const { copied, copy } = useCopyToClipboard({ resetTimeoutMs: 2000 });

	return (
		<button
			type="button"
			onClick={() => void copy(CONTACT_EMAIL)}
			className="flex items-center gap-3 transition-colors hover:text-foreground"
			aria-label={copied ? "Email copied" : `Copy ${CONTACT_EMAIL}`}
		>
			<AnimatedIconSwap swapKey={copied} className="size-5">
				{copied ? <Check className="size-5" /> : <Mail className="size-5" />}
			</AnimatedIconSwap>
			<span>{copied ? "Copied" : "Email"}</span>
		</button>
	);
}

export default function SiteFooter() {
	return (
		<footer className="bg-background text-foreground">
			<div className="mx-auto w-full max-w-7xl px-6 py-16">
				<div className="flex flex-col items-center">
					<ThinkExLogo size={32} />

					<div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-5 text-base text-muted-foreground">
						<FooterEmailLink />
						{communityLinks.map(({ href, label, icon: Icon }) => (
							<a
								key={href}
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-3 transition-colors hover:text-foreground"
							>
								<Icon className={label === "Twitter / X" ? "size-[18px]" : "size-5"} />
								<span>{label}</span>
							</a>
						))}
					</div>

					<div className="mt-14 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground/55 sm:mt-16 sm:text-sm">
						<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-5">
							<span>Terms of Service</span>
							<span>Privacy Policy</span>
							<span>Cookie Policy</span>
						</div>
						<p>© 2026 ThinkEx Inc. All rights reserved.</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
