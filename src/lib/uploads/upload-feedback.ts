function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function getDocumentUploadLoadingMessage(count: number): string {
  return `Adding ${count} ${pluralize(count, "file")}...`;
}

export function getDocumentUploadSuccessMessage(count: number): string {
  return `${count} ${pluralize(count, "file")} added`;
}

export function getDocumentUploadPartialMessage(
  addedCount: number,
  failedCount: number
): string {
  return `Added ${addedCount} ${pluralize(addedCount, "file")}, ${failedCount} failed`;
}

export function getDocumentUploadFailureMessage(count: number): string {
  return `Couldn't add ${count} ${pluralize(count, "file")}`;
}
