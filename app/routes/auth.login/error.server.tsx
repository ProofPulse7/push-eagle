import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

interface LoginErrorMessage {
  shop?: string;
  form?: string;
}

type ExtendedLoginError = LoginError & { form?: string };

export function loginErrorMessage(loginErrors: ExtendedLoginError): LoginErrorMessage {
  if (loginErrors?.form) {
    return { form: loginErrors.form };
  }

  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }

  return {};
}
