import env from "~/env";

/**
 * True if the current installation is the cloud hosted version at getoutline.com
 */
const isCloudHosted = [
  "https://app.getoutline.com",
  "https://app.outline.dev",
  "https://app.outline.dev:3000",
].includes(env.URL);

export default isCloudHosted;

/**
 * True if workspace subdomain routing is enabled (cloud hosted or self-hosted
 * with HOSTED_WORKSPACE_ROUTING=true).
 */
export const isWorkspaceRouting =
  isCloudHosted || env.HOSTED_WORKSPACE_ROUTING === true;
