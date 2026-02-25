"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            {...props}
        >
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917" /><path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917" />
        </svg>
    );
}

interface AuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
    redirectTo?: string;
    onSuccess?: () => void;
    title?: string;
    description?: string;
}

export function SignInForm({ className, redirectTo, title, description, ...props }: AuthFormProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signIn.social({
                provider: "google",
                callbackURL: redirectTo || "/home",
            });
        } catch (error) {
            toast.error("Failed to sign in with Google");
            setIsLoading(false);
        }
    };

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">{title || "Welcome back"}</h1>
                <p className="text-balance text-sm text-muted-foreground">
                    {description || "Sign in with your Google account to continue"}
                </p>
            </div>
            <div className="grid gap-6">
                <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon className="mr-1 h-4 w-4" />}
                    Continue with Google
                </Button>
            </div>
            <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/auth/sign-up" className="underline underline-offset-4">
                    Sign up
                </Link>
            </div>
        </div>
    );
}

export function SignUpForm({ className, redirectTo, title, description, ...props }: AuthFormProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signIn.social({
                provider: "google",
                callbackURL: redirectTo || "/onboarding",
            });
        } catch (error) {
            toast.error("Failed to sign in with Google");
            setIsLoading(false);
        }
    };

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">{title || "Create an account"}</h1>
                <p className="text-balance text-sm text-muted-foreground">
                    {description || "Sign up with your Google account to get started"}
                </p>
            </div>
            <div className="grid gap-6">
                <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon className="mr-1 h-4 w-4" />}
                    Continue with Google
                </Button>
            </div>
            <div className="text-center text-sm">
                Already have an account?{" "}
                <Link href="/auth/sign-in" className="underline underline-offset-4">
                    Login
                </Link>
            </div>
        </div>
    );
}
