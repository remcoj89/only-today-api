import { DocType, type DocumentBase } from "../shared";
import { listDocuments } from "../services/documentService";
import { updateSummary } from "../services/statusSummaryService";

type DateRange = {
  startDate?: string;
  endDate?: string;
};

function withinRange(doc: DocumentBase, range?: DateRange) {
  if (!range?.startDate && !range?.endDate) {
    return true;
  }
  if (range.startDate && doc.docKey < range.startDate) {
    return false;
  }
  if (range.endDate && doc.docKey > range.endDate) {
    return false;
  }
  return true;
}

export async function updateSummariesForUser(
  userId: string,
  accessToken: string,
  range?: DateRange
): Promise<number> {
  const documents = await listDocuments(userId, accessToken, { docType: DocType.Day });
  let updatedCount = 0;
  for (const document of documents) {
    if (!withinRange(document, range)) {
      continue;
    }
    await updateSummary(userId, document.docKey, document);
    updatedCount += 1;
  }
  return updatedCount;
}
