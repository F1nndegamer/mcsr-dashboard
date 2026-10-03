/**
 * Structural validation for Google Sheets `spreadsheets.batchUpdate` requests.
 *
 * Unit tests that only inspect request *shapes* cannot catch payload fields the
 * live API rejects, so this module encodes the official Sheets v4 discovery
 * document (https://sheets.googleapis.com/$discovery/rest?version=v4):
 *
 *   - every request object must carry exactly ONE known request type,
 *   - conditional-format rules must be well formed,
 *   - `InterpolationPoint.value` is a JSON **string** field and is only valid
 *     for NUMBER / PERCENT / PERCENTILE points (unused for MIN / MAX).
 *
 * `GoogleSheetsBackend.batchUpdateSpreadsheet` runs this before any HTTP call,
 * so an invalid payload fails locally with an actionable message instead of
 * surfacing as an opaque live `Invalid JSON payload received` error.
 */

/**
 * Every request type accepted by `spreadsheets.batchUpdate`, verbatim from the
 * official Sheets v4 discovery document. There is deliberately NO
 * `clearConditionalFormatRules` (it does not exist): conditional formats are
 * managed with add / delete / update **by index**.
 */
export const BATCH_UPDATE_REQUEST_TYPES = [
  "addBanding",
  "addChart",
  "addCommentReply",
  "addConditionalFormatRule",
  "addDataSource",
  "addDimensionGroup",
  "addFilterView",
  "addNamedRange",
  "addProtectedRange",
  "addSlicer",
  "addSheet",
  "addTable",
  "appendCells",
  "appendDimension",
  "autoFill",
  "autoResizeDimensions",
  "cancelDataSourceRefresh",
  "clearBasicFilter",
  "copyPaste",
  "createDeveloperMetadata",
  "cutPaste",
  "deleteBanding",
  "deleteComment",
  "deleteCommentReply",
  "deleteConditionalFormatRule",
  "deleteDataSource",
  "deleteDeveloperMetadata",
  "deleteDimension",
  "deleteDimensionGroup",
  "deleteDuplicates",
  "deleteEmbeddedObject",
  "deleteFilterView",
  "deleteNamedRange",
  "deleteProtectedRange",
  "deleteRange",
  "deleteSheet",
  "deleteTable",
  "duplicateFilterView",
  "duplicateSheet",
  "findReplace",
  "insertComment",
  "insertDimension",
  "insertRange",
  "mergeCells",
  "moveDimension",
  "pasteData",
  "randomizeRange",
  "refreshDataSource",
  "repeatCell",
  "setBasicFilter",
  "setDataValidation",
  "sortRange",
  "textToColumns",
  "trimWhitespace",
  "unmergeCells",
  "updateBanding",
  "updateBorders",
  "updateChartSpec",
  "updateCells",
  "updateCommentPost",
  "updateConditionalFormatRule",
  "updateDataSource",
  "updateDeveloperMetadata",
  "updateDimensionGroup",
  "updateDimensionProperties",
  "updateEmbeddedObjectBorder",
  "updateEmbeddedObjectPosition",
  "updateFilterView",
  "updateNamedRange",
  "updateProtectedRange",
  "updateSheetProperties",
  "updateSlicerSpec",
  "updateSpreadsheetProperties",
  "updateTable",
];

/** InterpolationPoint.type enum, verbatim from the discovery document. */
export const INTERPOLATION_POINT_TYPES = [
  "MIN",
  "MAX",
  "NUMBER",
  "PERCENT",
  "PERCENTILE",
];

const REQUEST_TYPE_SET = new Set(BATCH_UPDATE_REQUEST_TYPES);

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeInt = (value) => Number.isInteger(value) && value >= 0;

/**
 * TextFormat-only fields that are sometimes mistakenly placed directly on
 * `CellFormat` (`userEnteredFormat`). Per the Sheets v4 schema, `CellFormat`
 * has NO `fontFamily` (or `bold`, `foregroundColor`, ...) of its own — those
 * live on `userEnteredFormat.textFormat`. The live API rejects the misplaced
 * shape with e.g.:
 *   Unknown name "fontFamily" at
 *   'requests[6].repeat_cell.cell.user_entered_format': Cannot find field.
 */
const TEXT_FORMAT_ONLY_FIELDS = [
  "fontFamily",
  "bold",
  "italic",
  "foregroundColor",
  "foregroundColorStyle",
  "fontSize",
  "strikethrough",
  "underline",
];

const validateCellUserEnteredFormat = (format, label, index, request, fields) => {
  if (format === undefined || format === null) return;
  if (!isPlainObject(format)) {
    fail(index, `${label} must be an object.`, request);
  }
  for (const key of TEXT_FORMAT_ONLY_FIELDS) {
    if (key in format) {
      fail(
        index,
        `${label}.${key} is invalid: ${key} is not a field of CellFormat; ` +
          `${key} must live on textFormat ` +
          `(use ${label}.textFormat.${key} and mask userEnteredFormat.textFormat.${key}).`,
        request,
      );
    }
  }
  if (typeof fields === "string" && fields.includes("userEnteredFormat.fontFamily")) {
    fail(
      index,
      `${label} fields mask "userEnteredFormat.fontFamily" is invalid: ` +
        "fontFamily must live on textFormat " +
        '(use mask "userEnteredFormat.textFormat.fontFamily").',
      request,
    );
  }
};

/** Validates the `cell` + `fields` of a RepeatCellRequest payload. */
const validateRepeatCellFormat = (payload, index, request) => {
  validateCellUserEnteredFormat(
    payload.cell?.userEnteredFormat,
    `${Object.keys(request)[0]}.cell.userEnteredFormat`,
    index,
    request,
    payload.fields,
  );
};

/**
 * Validates every `rows[].values[].userEnteredFormat` of UpdateCells /
 * AppendCells payloads (same CellFormat schema as RepeatCell).
 */
const validateRowsFormat = (payload, index, request) => {
  const type = Object.keys(request)[0];
  if (payload.rows === undefined) return;
  if (!Array.isArray(payload.rows)) {
    fail(index, `${type}.rows must be an array.`, request);
  }
  payload.rows.forEach((row, rowIndex) => {
    const values = row?.values;
    if (values === undefined) return;
    if (!Array.isArray(values)) {
      fail(index, `${type}.rows[${rowIndex}].values must be an array.`, request);
    }
    values.forEach((cellData, cellIndex) => {
      validateCellUserEnteredFormat(
        cellData?.userEnteredFormat,
        `${type}.rows[${rowIndex}].values[${cellIndex}].userEnteredFormat`,
        index,
        request,
        payload.fields,
      );
    });
  });
  if (typeof payload.fields === "string" && payload.fields.includes("userEnteredFormat.fontFamily")) {
    fail(
      index,
      `${type} fields mask "userEnteredFormat.fontFamily" is invalid: ` +
        "fontFamily must live on textFormat " +
        '(use mask "userEnteredFormat.textFormat.fontFamily").',
      request,
    );
  }
};

const fail = (index, message, request) => {
  let detail = "";
  try {
    detail = ` Request: ${JSON.stringify(request).slice(0, 400)}`;
  } catch {
    /* ignore serialisation failures */
  }
  throw new Error(`Invalid batchUpdate request at requests[${index}]: ${message}${detail}`);
};

/**
 * An InterpolationPoint pins a gradient to a colour. `value` is a string field
 * ("May be a formula. Unused if type is MIN or MAX."), so a numeric midpoint
 * such as `50` is rejected by the live API with a TYPE_STRING error.
 */
const validateInterpolationPoint = (point, label, index, request) => {
  if (!isPlainObject(point)) {
    fail(index, `${label} must be an object.`, request);
  }
  if (!INTERPOLATION_POINT_TYPES.includes(point.type)) {
    fail(
      index,
      `${label}.type ${JSON.stringify(point.type)} is not a valid InterpolationPoint type ` +
        `(expected one of ${INTERPOLATION_POINT_TYPES.join(", ")}).`,
      request,
    );
  }
  const hasValue = point.value !== undefined && point.value !== null;
  if (point.type === "MIN" || point.type === "MAX") {
    if (hasValue) {
      fail(
        index,
        `${label}.value must be omitted when type is ${point.type} (the API ignores it there).`,
        request,
      );
    }
    return;
  }
  // NUMBER / PERCENT / PERCENTILE require the value as a JSON string.
  if (!hasValue) {
    fail(index, `${label}.value is required when type is ${point.type}.`, request);
  }
  if (typeof point.value !== "string") {
    fail(
      index,
      `${label}.value must be a string (received ${typeof point.value} ` +
        `${JSON.stringify(point.value)}); InterpolationPoint.value is a string field.`,
      request,
    );
  }
  // The string must be the number itself (e.g. "50" for PERCENTILE) or a
  // formula - anything else fails server-side when the rule is applied.
  if (!point.value.startsWith("=") && !/^-?\d+(\.\d+)?$/.test(point.value)) {
    fail(
      index,
      `${label}.value must be a numeric string or a formula ` +
        `(received ${JSON.stringify(point.value)}).`,
      request,
    );
  }
};

const validateGradientRule = (gradient, label, index, request) => {
  if (!isPlainObject(gradient)) {
    fail(index, `${label} must be an object.`, request);
  }
  if (!isPlainObject(gradient.minpoint) || !isPlainObject(gradient.maxpoint)) {
    fail(index, `${label} requires both minpoint and maxpoint.`, request);
  }
  validateInterpolationPoint(gradient.minpoint, `${label}.minpoint`, index, request);
  if (gradient.midpoint !== undefined && gradient.midpoint !== null) {
    validateInterpolationPoint(gradient.midpoint, `${label}.midpoint`, index, request);
  }
  validateInterpolationPoint(gradient.maxpoint, `${label}.maxpoint`, index, request);
};

const validateConditionalRule = (rule, label, index, request) => {
  if (!isPlainObject(rule)) {
    fail(index, `${label} must be an object.`, request);
  }
  if (!Array.isArray(rule.ranges) || rule.ranges.length === 0) {
    fail(index, `${label}.ranges must be a non-empty array of GridRange.`, request);
  }
  const hasGradient = rule.gradientRule !== undefined && rule.gradientRule !== null;
  const hasBoolean = rule.booleanRule !== undefined && rule.booleanRule !== null;
  if (hasGradient && hasBoolean) {
    fail(index, `${label} must set only one of gradientRule / booleanRule.`, request);
  }
  if (!hasGradient && !hasBoolean) {
    fail(index, `${label} must set gradientRule or booleanRule.`, request);
  }
  if (hasGradient) {
    validateGradientRule(rule.gradientRule, `${label}.gradientRule`, index, request);
  }
  if (hasBoolean) {
    const condition = rule.booleanRule?.condition;
    if (!isPlainObject(condition) || typeof condition.type !== "string") {
      fail(index, `${label}.booleanRule.condition.type must be a string.`, request);
    }
    // Conditional-format `booleanRule.format` is a CellFormat too: reject
    // TextFormat-only fields (e.g. fontFamily) placed directly on it.
    validateCellUserEnteredFormat(
      rule.booleanRule?.format,
      `${label}.booleanRule.format`,
      index,
      request,
      undefined,
    );
  }
};

/**
 * Validates an array of `spreadsheets.batchUpdate` requests, throwing on the
 * first structurally invalid entry. Returns the input on success so it can be
 * used inline.
 */
export const validateBatchUpdateRequests = (requests) => {
  if (!Array.isArray(requests)) {
    throw new Error("batchUpdate requests must be an array.");
  }
  requests.forEach((request, index) => {
    if (!isPlainObject(request)) {
      fail(index, "each request must be an object.", request);
    }
    const keys = Object.keys(request);
    if (keys.length !== 1) {
      fail(
        index,
        `each request must contain exactly one request type, found ${keys.length} ` +
          `(${keys.join(", ") || "none"}).`,
        request,
      );
    }
    const type = keys[0];
    if (!REQUEST_TYPE_SET.has(type)) {
      fail(
        index,
        `unknown request type "${type}". "${type}" is not a field of the ` +
          "spreadsheets.batchUpdate Request schema.",
        request,
      );
    }
    const payload = request[type];
    if (!isPlainObject(payload)) {
      fail(index, `${type} payload must be an object.`, request);
    }
    switch (type) {
      case "addConditionalFormatRule": {
        if (!isPlainObject(payload.rule)) {
          fail(index, "addConditionalFormatRule.rule is required.", request);
        }
        validateConditionalRule(payload.rule, "addConditionalFormatRule.rule", index, request);
        if (payload.index !== undefined && !isNonNegativeInt(payload.index)) {
          fail(index, "addConditionalFormatRule.index must be a non-negative integer.", request);
        }
        break;
      }
      case "updateConditionalFormatRule": {
        if (!isNonNegativeInt(payload.index)) {
          fail(index, "updateConditionalFormatRule.index must be a non-negative integer.", request);
        }
        if (payload.rule !== undefined && payload.rule !== null) {
          validateConditionalRule(payload.rule, "updateConditionalFormatRule.rule", index, request);
        }
        if (payload.newIndex !== undefined && !isNonNegativeInt(payload.newIndex)) {
          fail(index, "updateConditionalFormatRule.newIndex must be a non-negative integer.", request);
        }
        break;
      }
      case "deleteConditionalFormatRule": {
        if (!isNonNegativeInt(payload.index)) {
          fail(index, "deleteConditionalFormatRule.index must be a non-negative integer.", request);
        }
        break;
      }
      case "repeatCell": {
        if (payload.cell !== undefined) {
          validateRepeatCellFormat(payload, index, request);
        }
        break;
      }
      case "updateCells":
      case "appendCells": {
        validateRowsFormat(payload, index, request);
        break;
      }
      default:
        break;
    }
  });
  return requests;
};

