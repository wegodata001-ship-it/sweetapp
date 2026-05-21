/** מצב מסירה ללקוח — מסתיר אזהרות dev/QA ומצמצם רעש UI */
export function isSystemCleanMode(): boolean {
  return (
    process.env.SYSTEM_CLEAN_MODE === "true" ||
    process.env.SYSTEM_CLEAN_MODE === "1"
  );
}
