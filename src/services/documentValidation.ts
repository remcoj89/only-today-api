import { DocType } from "../shared";
import { AppError } from "../errors";
import {
  DayContentSchema,
  MonthContentSchema,
  QuarterContentSchema,
  WeekContentSchema
} from "../schemas/documents";

export function validateDocument(docType: DocType, content: unknown) {
  let result;
  switch (docType) {
    case DocType.Day:
      result = DayContentSchema.safeParse(content);
      break;
    case DocType.Week:
      result = WeekContentSchema.safeParse(content);
      break;
    case DocType.Month:
      result = MonthContentSchema.safeParse(content);
      break;
    case DocType.Quarter:
      result = QuarterContentSchema.safeParse(content);
      break;
    default:
      throw AppError.validationError("Unsupported document type", { docType });
  }

  if (!result.success) {
    throw AppError.validationError("Invalid document content", result.error.flatten());
  }
}
