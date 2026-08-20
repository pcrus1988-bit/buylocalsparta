import packageMetadata from "../../package.json";

// Source marker to force a production rebuild for the AADE MARK reconciliation hotfix.
export const WEB_BUILD_VERSION = packageMetadata.version;
