export interface Annotation {
  id: string;
  x: number; // 0–1 normalized relative to image width
  y: number; // 0–1 normalized relative to image height
  comment: string;
}

export const MAX_ANNOTATIONS_PER_PHOTO = 5;
export const MAX_ANNOTATION_COMMENT_CHARS = 150;
