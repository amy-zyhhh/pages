if (process.env.INFORS_ALLOW_INSECURE_TLS === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.emitWarning(
    "InfoRSS is running with INFORS_ALLOW_INSECURE_TLS=1. TLS certificate verification is disabled for this Node.js process.",
    {
      code: "INFORS_INSECURE_TLS",
    },
  );
}
