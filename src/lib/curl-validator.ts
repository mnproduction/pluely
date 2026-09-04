import curl2Json from "@bany/curl-to-json";

export interface CurlValidationResult {
  isValid: boolean;
  message?: string;
}

export const validateCurl = (
  curl: string,
  requiredVariables: string[]
): CurlValidationResult => {
  if (!curl.trim().startsWith("curl")) {
    return {
      isValid: false,
      message: "The command must start with 'curl'.",
    };
  }

  try {
    curl2Json(curl);
  } catch (error) {
    return {
      isValid: false,
      message:
        "Invalid cURL command syntax. Check the command, quotes, headers, and request body.",
    };
  }

  const missingVariables = requiredVariables.filter(
    (variable) => !curl.includes(`{{${variable}}}`)
  );

  if (missingVariables.length > 0) {
    const missingVarsString = missingVariables
      .map((v) => `{{${v}}}`)
      .join(", ");
    return {
      isValid: false,
      message: `The following required variables are missing: ${missingVarsString}.`,
    };
  }

  const hasCredentialHeader =
    /(?:authorization|x-api-key|api-key)\s*:/i.test(curl);

  if (hasCredentialHeader && !curl.includes("{{API_KEY}}")) {
    return {
      isValid: false,
      message:
        "Credential headers must use {{API_KEY}}. Store the value in the provider settings instead of the cURL command.",
    };
  }

  return { isValid: true };
};
