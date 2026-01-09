export function formatAuthError(message: string): string {
  if (!message) return "Login failed";
  switch (message) {
    case ".no_token":
      return "Authentication failed. Please check your credentials.";
    case ".auth_failed":
    case ".wrong_password":
      return "Invalid email or password.";
    case ".token_expired":
      return "Your session expired. Please sign in again.";
    case ".email_not_verified":
      return "Please verify your email before signing in.";
    case ".wrong_log_in_method":
      return "This account uses a social sign-in. Use the same provider on logically.app.";
    default:
      return message;
  }
}
