/**
 * Shared utility functions for consistent tool response formatting.
 *
 * All domain tools should use these utilities to ensure consistent
 * response structure across success and error cases.
 *
 * @example
 * ```typescript
 * // Success response
 * return createToolSuccess({ issues, incidents, alerts });
 *
 * // Error response
 * return createToolError('get_investigation_context', errorMessage);
 * ```
 */

/**
 * Creates a standardized success response for a tool.
 * Spreads the data object and adds a `success: true` discriminator.
 *
 * @param data - The success payload to return
 * @returns JSON string with success indicator and data
 */
export const createToolSuccess = <T extends object>(data: T): string => {
  return JSON.stringify({ success: true, ...data });
};

/**
 * Creates a standardized error response for a tool.
 * Includes the tool name for context in error messages.
 *
 * @param toolName - Name of the tool that failed (for error context)
 * @param message - Error message describing the failure
 * @returns JSON string with success: false and formatted error
 */
export const createToolError = (toolName: string, message: string): string => {
  return JSON.stringify({ success: false, error: `${toolName}: ${message}` });
};
