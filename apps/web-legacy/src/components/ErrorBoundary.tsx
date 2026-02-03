import { Alert, Button } from "@heroui/react";
import { AlertCircle } from "lucide-react";
import React from "react";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component to catch runtime errors and prevent white screen crashes.
 * Wraps critical areas of the app to provide graceful error handling with user-friendly UI.
 *
 * Features:
 * - Catches component tree errors with componentDidCatch
 * - Displays user-friendly error message with Alert component
 * - Provides reload button to recover from error state
 * - Logs errors to console for debugging
 * - Supports custom fallback UI via props
 */
export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		/** Update state so the next render will show the fallback UI */
		return {
			hasError: true,
			error,
		};
	}

	override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		/*
		 * Log error details to console for debugging
		 * biome-ignore lint/suspicious/noConsole: Error boundaries require console logging for debugging
		 */
		console.error("ErrorBoundary caught an error:", error, errorInfo);

		/** Update state with error info for display */
		this.setState({
			errorInfo,
		});
	}

	handleReset = (): void => {
		/** Reset error state and reload the page */
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		});
		window.location.reload();
	};

	handleTryAgain = (): void => {
		/** Reset error state without reloading (useful for transient errors) */
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		});
	};

	override render() {
		if (this.state.hasError) {
			/** Custom fallback UI provided via props */
			if (this.props.fallback) {
				return this.props.fallback;
			}

			/** Default fallback UI using HeroUI Alert component */
			return (
				<div className="flex min-h-screen items-center justify-center p-4 bg-background">
					<div className="w-full max-w-2xl">
						<Alert status="danger">
							<Alert.Indicator>
								<AlertCircle className="w-5 h-5" />
							</Alert.Indicator>
							<Alert.Content>
								<Alert.Title>Something went wrong</Alert.Title>
								<Alert.Description>
									<p className="mb-4">
										An unexpected error occurred in the application. This could
										be due to a network issue, browser compatibility, or a bug
										in the code.
									</p>
									<p className="mb-4 font-medium">What you can try:</p>
									<ul className="list-inside list-disc space-y-1 text-sm mb-4">
										<li>
											Click "Try Again" to attempt recovery without reloading
										</li>
										<li>Click "Reload Page" to refresh and start over</li>
										<li>Check your internet connection</li>
										<li>Clear your browser cache if the problem persists</li>
									</ul>
									{this.state.error && import.meta.env.DEV && (
										<details className="mt-4 text-xs">
											<summary className="cursor-pointer font-medium">
												Error details (dev only)
											</summary>
											<pre className="mt-2 p-2 bg-danger-50 dark:bg-danger-950 rounded overflow-auto">
												<code>
													{this.state.error.toString()}
													{this.state.errorInfo?.componentStack}
												</code>
											</pre>
										</details>
									)}
								</Alert.Description>
								<div className="flex gap-2 mt-4">
									<Button
										size="sm"
										variant="danger"
										onPress={this.handleTryAgain}
									>
										Try Again
									</Button>
									<Button
										size="sm"
										variant="secondary"
										onPress={this.handleReset}
									>
										Reload Page
									</Button>
								</div>
							</Alert.Content>
						</Alert>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
