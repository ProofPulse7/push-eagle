import type { ActionFunctionArgs } from "react-router";

import { handleBillingCreateRequest } from "../lib/shopify-billing.server";

export const action = async ({ request }: ActionFunctionArgs) => handleBillingCreateRequest(request);
