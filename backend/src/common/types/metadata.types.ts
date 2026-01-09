export interface SessionMetadata {
  [key: string]: any; // Allow other properties
}

export interface MessageMetadata {
  suggestedOptions?: string[]; // For quick replies etc.
  [key: string]: any; // Allow other properties
}
