import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";

export function BottomCtaSection() {
	return (
		<section className="relative left-1/2 mt-14 w-screen -translate-x-1/2 bg-muted/45 py-16 text-center sm:mt-20 sm:py-24 dark:bg-white/[0.055]">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
				<h2 className="mx-auto max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
					Create your workspace
				</h2>
				<div className="mt-7 flex justify-center">
					<Button
						nativeButton={false}
						render={<Link to="/login" />}
						size="lg"
						className="h-12 px-6"
					>
						Get started
					</Button>
				</div>
			</div>
		</section>
	);
}
