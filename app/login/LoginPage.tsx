'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from '@bfeai/ui';
import { loginSchema, type LoginInput } from '@/lib/validation/schemas';
import { useRecaptcha, RecaptchaScript } from '@/components/recaptcha';

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || null;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const { getToken } = useRecaptcha(RECAPTCHA_SITE_KEY, 'login');

  // Check if reCAPTCHA is ready
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      setRecaptchaReady(true); // No reCAPTCHA configured, allow form
      return;
    }

    const checkReady = () => {
      if (window.grecaptcha) {
        setRecaptchaReady(true);
      } else {
        setTimeout(checkReady, 100);
      }
    };

    // Give script time to load
    setTimeout(checkReady, 500);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);

    try {
      // Get reCAPTCHA token if configured
      let recaptchaToken: string | null = null;
      if (RECAPTCHA_SITE_KEY) {
        recaptchaToken = await getToken();
        if (!recaptchaToken) {
          toast.error('reCAPTCHA verification failed. Please refresh and try again.');
          setIsLoading(false);
          return;
        }
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          rememberMe,
          recaptchaToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Invalid email or password');
        return;
      }

      // Success - redirect to specified URL or default to profile
      const redirectUrl = searchParams.get('redirect') || '/profile';

      // Check if redirect is to another BFEAI subdomain (cross-domain SSO)
      const isCrossDomainRedirect = redirectUrl.startsWith('https://') &&
        redirectUrl.includes('.bfeai.com') &&
        !redirectUrl.startsWith('https://dashboard.bfeai.com');

      // Also check for localhost in development
      const isDevCrossDomainRedirect = process.env.NODE_ENV !== 'production' &&
        redirectUrl.startsWith('http://localhost:') &&
        !redirectUrl.includes(':3000'); // dashboard.bfeai is typically on 3000

      if (isCrossDomainRedirect || isDevCrossDomainRedirect) {
        // Use code-based flow for cross-subdomain redirects
        try {
          const url = new URL(redirectUrl);
          const clientId = isCrossDomainRedirect
            ? url.hostname.split('.')[0] // Extract "keywords" from "keywords.bfeai.com"
            : 'keywords'; // Default for dev

          // Generate authorization code
          const codeResponse = await fetch('/api/auth/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              redirect_uri: redirectUrl,
            }),
          });

          if (codeResponse.ok) {
            const { code } = await codeResponse.json();

            // Redirect to target app's SSO exchange endpoint
            const exchangeUrl = new URL('/sso-exchange', url.origin);
            exchangeUrl.searchParams.set('code', code);
            exchangeUrl.searchParams.set('redirect', url.pathname + url.search);

            window.location.href = exchangeUrl.toString();
            return;
          }

          // If code generation fails, fall back to direct redirect
          // (cookie might work, better than failing completely)
          console.warn('Code generation failed, falling back to direct redirect');
        } catch (codeError) {
          console.error('Code generation error:', codeError);
          // Fall back to direct redirect
        }
      }

      // Internal navigation or fallback for external URLs
      if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
        window.location.href = redirectUrl;
      } else {
        router.push(redirectUrl);
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Load reCAPTCHA script */}
      {RECAPTCHA_SITE_KEY && <RecaptchaScript siteKey={RECAPTCHA_SITE_KEY} />}

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background-secondary to-background-tertiary py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Premium background decoration */}
      <div className="absolute inset-0 bg-grid-slate-200 [mask-image:radial-gradient(white,transparent_85%)] pointer-events-none" />
      <div className="absolute top-20 left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none animate-pulse-ring" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none animate-pulse-ring" style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-md relative animate-scale-in backdrop-blur-sm bg-background/95">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to access all BFEAI apps with one account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <div className="space-y-3 animate-fade-in">
              <Label htmlFor="email">Email address</Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  {...register('email')}
                  aria-invalid={errors.email ? 'true' : 'false'}
                  className="transition-all duration-normal group-hover:shadow-md"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
              </div>
              {errors.email && (
                <p className="text-sm text-error flex items-center gap-1 animate-fade-in" role="alert">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-3 animate-fade-in animate-delay-100">
              <Label htmlFor="password">Password</Label>
              <div className="relative group">
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...register('password')}
                  aria-invalid={errors.password ? 'true' : 'false'}
                  className="transition-all duration-normal group-hover:shadow-md"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
              {errors.password && (
                <p className="text-sm text-error flex items-center gap-1 animate-fade-in" role="alert">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between animate-fade-in animate-delay-200">
              <div className="flex items-center space-x-2 group">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={isLoading}
                  className="transition-all duration-normal"
                />
                <Label
                  htmlFor="remember-me"
                  className="text-sm font-medium cursor-pointer text-gray-700 dark:text-gray-300 group-hover:text-foreground transition-colors duration-normal"
                >
                  Remember me
                </Label>
              </div>

              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-primary hover:text-primary-hover transition-all duration-normal hover:translate-x-0.5"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full animate-fade-in animate-delay-300"
              disabled={isLoading || (!!RECAPTCHA_SITE_KEY && !recaptchaReady)}
              size="lg"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <svg className="w-5 h-5 ml-2 transition-transform duration-normal group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </Button>

            {/* OAuth Divider */}
            <div className="relative animate-fade-in animate-delay-400">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t-2 border-border" />
              </div>
              <div className="relative flex justify-center text-sm font-semibold uppercase tracking-wider">
                <span className="bg-background px-4 text-gray-700 dark:text-gray-300">Or continue with</span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="grid grid-cols-2 gap-4 animate-fade-in animate-delay-500">
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => {
                  const redirect = searchParams.get('redirect') || '/profile';
                  window.location.href = `/oauth-start?provider=google&redirect=${encodeURIComponent(redirect)}`;
                }}
                className="group"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => {
                  const redirect = searchParams.get('redirect') || '/profile';
                  window.location.href = `/oauth-start?provider=github&redirect=${encodeURIComponent(redirect)}`;
                }}
                className="group"
              >
                <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </Button>
            </div>

            <div className="text-center text-sm text-gray-700 dark:text-gray-300 animate-fade-in animate-delay-500">
              Don't have an account?{' '}
              <Link
                href="/signup"
                className="font-semibold text-primary hover:text-primary-hover transition-all duration-normal inline-flex items-center gap-1 group"
              >
                Sign up
                <svg className="w-4 h-4 transition-transform duration-normal group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* reCAPTCHA notice */}
            {RECAPTCHA_SITE_KEY && (
              <p className="text-xs text-center text-gray-700 dark:text-gray-300 mt-4">
                Protected by reCAPTCHA.{' '}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:text-gray-300">
                  Privacy
                </a>{' '}
                &{' '}
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:text-gray-300">
                  Terms
                </a>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
      </div>
    </>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background-secondary to-background-tertiary">
        <div className="text-center space-y-4">
          <div className="animate-shimmer w-64 h-96 rounded-2xl"></div>
          <p className="text-gray-700 dark:text-gray-300 animate-pulse">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
