export {};

declare global {
  type GoogleOAuthPrompt = "" | "none" | "consent" | "select_account";

  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            /** Default GIS behavior is `select_account` (account picker every time). Use `""` for minimal prompts. */
            prompt?: GoogleOAuthPrompt;
            include_granted_scopes?: boolean;
            login_hint?: string;
            error_callback?: (error: {
              type: "popup_failed_to_open" | "popup_closed" | "unknown";
              message?: string;
            }) => void;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => {
            requestAccessToken: (override?: {
              prompt?: GoogleOAuthPrompt;
              login_hint?: string;
              include_granted_scopes?: boolean;
            }) => void;
          };
        };
      };
    };
  }
}
